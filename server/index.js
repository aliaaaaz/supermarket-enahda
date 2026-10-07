import bcrypt from 'bcryptjs'
import cors from 'cors'
import Database from 'better-sqlite3'
import express from 'express'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'enahda.db')
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex')

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.')
}

if (databasePath !== ':memory:') {
  mkdirSync(path.dirname(databasePath), { recursive: true })
}

const db = new Database(databasePath)
db.pragma('journal_mode = WAL')

const app = express()
const PORT = Number(process.env.PORT || 3001)
const allowedOrigins = process.env.CORS_ORIGIN
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function normalizeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    stock: row.stock,
    isActive: row.is_active !== 0,
    status: row.stock <= 20 ? 'low-stock' : 'in-stock',
    badge: row.badge,
    description: row.description,
  }
}

function isValidText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
}

function isValidEmail(value) {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isValidPhone(value) {
  return typeof value === 'string'
    && value.length <= 24
    && /^\+?[\d\s()-]{7,24}$/.test(value.trim())
    && (value.match(/\d/g) || []).length >= 7
}

function createAccessToken(user) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    role: user.role,
    version: user.token_version ?? 0,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
  })).toString('base64url')
  const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url')

  return `${payload}.${signature}`
}

function readAccessToken(request) {
  const [scheme, token] = String(request.headers.authorization || '').split(' ')

  if (scheme !== 'Bearer' || !token) {
    return null
  }

  const [payload, suppliedSignature] = token.split('.')

  if (!payload || !suppliedSignature) {
    return null
  }

  const expectedSignature = createHmac('sha256', sessionSecret).update(payload).digest()
  const actualSignature = Buffer.from(suppliedSignature, 'base64url')

  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    return null
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())

    if (!Number.isInteger(claims.sub) || claims.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }

    return claims
  } catch {
    return null
  }
}

function getAuthenticatedUser(request) {
  const claims = readAccessToken(request)

  if (!claims) {
    return null
  }

  const user = db.prepare('SELECT id, name, email, role, token_version FROM users WHERE id = ?').get(claims.sub)

  return user && claims.version === user.token_version ? { ...claims, ...user } : null
}

function initializeDatabase() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      badge TEXT NOT NULL,
      description TEXT NOT NULL
    )
  `).run()

  const productColumns = db.prepare('PRAGMA table_info(products)').all()

  if (!productColumns.some((column) => column.name === 'is_active')) {
    db.exec('ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1')
  }

  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      token_version INTEGER NOT NULL DEFAULT 0
    )
  `).run()

  const userColumns = db.prepare('PRAGMA table_info(users)').all()

  if (!userColumns.some((column) => column.name === 'token_version')) {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0')
  }

  db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      user_id INTEGER,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      delivery_method TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash_on_delivery',
      latitude REAL,
      longitude REAL,
      subtotal REAL NOT NULL,
      delivery_fee REAL NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  const orderColumns = db.prepare('PRAGMA table_info(orders)').all()

  if (!orderColumns.some((column) => column.name === 'user_id')) {
    db.exec('ALTER TABLE orders ADD COLUMN user_id INTEGER')
  }

  if (!orderColumns.some((column) => column.name === 'payment_method')) {
    db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash_on_delivery'")
  }

  if (!orderColumns.some((column) => column.name === 'latitude')) {
    db.exec('ALTER TABLE orders ADD COLUMN latitude REAL')
  }

  if (!orderColumns.some((column) => column.name === 'longitude')) {
    db.exec('ALTER TABLE orders ADD COLUMN longitude REAL')
  }

  db.prepare(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `).run()

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count

  if (userCount === 0) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@enahda.store'
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminPassword) {
      throw new Error('ADMIN_PASSWORD must be set before initializing the database.')
    }

    const adminPasswordHash = bcrypt.hashSync(adminPassword, 10)
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, 'admin')
    `).run('Admin eNahda', adminEmail, adminPasswordHash)
  }

  const productCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count

  if (productCount === 0) {
    const seedProducts = [
      {
        name: 'Organic Tomatoes',
        category: 'Fruits & Veg',
        price: 18,
        stock: 86,
        badge: 'Fresh',
        description: 'Picked daily for freshness, rich in flavor, and perfect for healthy meals.',
      },
      {
        name: 'Farmer Eggs',
        category: 'Dairy',
        price: 25,
        stock: 17,
        badge: 'Top Pick',
        description: 'Farm-raised eggs with excellent quality and rich taste.',
      },
      {
        name: 'Moroccan Bread',
        category: 'Bakery',
        price: 12,
        stock: 42,
        badge: 'Hot',
        description: 'Freshly baked local bread prepared every morning.',
      },
      {
        name: 'Orange Juice',
        category: 'Beverages',
        price: 30,
        stock: 28,
        badge: 'New',
        description: 'Fresh orange juice with natural flavor and no preservatives.',
      },
      {
        name: 'Hand Soap',
        category: 'Household',
        price: 22,
        stock: 11,
        badge: 'Essential',
        description: 'Gentle and effective household soap for daily cleaning.',
      },
    ]

    const insertProduct = db.prepare(`
      INSERT INTO products (name, category, price, stock, badge, description)
      VALUES (@name, @category, @price, @stock, @badge, @description)
    `)

    const transaction = db.transaction((items) => {
      for (const item of items) {
        insertProduct.run(item)
      }
    })

    transaction(seedProducts)
  }
}

initializeDatabase()

app.use(cors(allowedOrigins?.length ? { origin: allowedOrigins } : undefined))
app.use(express.json())

app.get('/health', (_, response) => {
  response.json({ status: 'ok', service: 'supermarket-enahda-api' })
})

app.get('/api/products', (_, response) => {
  const products = db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY id').all()
  response.json(products.map(normalizeProduct))
})

function requireAdmin(request, response, next) {
  const user = getAuthenticatedUser(request)

  if (user?.role !== 'admin') {
    return response.status(403).json({ error: 'Admin access required.' })
  }

  request.auth = user
  return next()
}

function requireUser(request, response, next) {
  const user = getAuthenticatedUser(request)

  if (!user) {
    return response.status(401).json({ error: 'A valid login session is required.' })
  }

  request.auth = user
  return next()
}

app.get('/api/auth/session', requireUser, (request, response) => {
  const { id, name, email, role } = request.auth
  response.json({ user: { id, name, email, role } })
})

app.post('/api/auth/logout', requireUser, (request, response) => {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(request.auth.id)
  response.json({ success: true, message: 'Signed out successfully.' })
})

app.get('/api/admin/products', requireAdmin, (_, response) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id').all()
  response.json(products.map(normalizeProduct))
})

app.post('/api/products', requireAdmin, (request, response) => {
  const { name, category, price, stock, badge, description } = request.body || {}

  if (!isValidText(name, 120)) {
    return response.status(400).json({ error: 'Product name must be 1 to 120 characters.' })
  }

  if (!isValidText(category, 80)) {
    return response.status(400).json({ error: 'Product category must be 1 to 80 characters.' })
  }

  const numericPrice = Number(price)
  const numericStock = Number(stock)

  if (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > 1000000) {
    return response.status(400).json({ error: 'Product price must be between 0 and 1,000,000.' })
  }

  if (!Number.isInteger(numericStock) || numericStock < 0 || numericStock > 1000000) {
    return response.status(400).json({ error: 'Stock must be a non-negative integer no greater than 1,000,000.' })
  }

  if (badge !== undefined && !isValidText(badge, 40)) {
    return response.status(400).json({ error: 'Product badge must be 1 to 40 characters.' })
  }

  if (description !== undefined && !isValidText(description, 500)) {
    return response.status(400).json({ error: 'Product description must be 1 to 500 characters.' })
  }

  const normalizedBadge = badge === undefined ? 'New' : badge.trim()
  const normalizedDescription = description === undefined ? 'Fresh product from eNahda.' : description.trim()

  const result = db.prepare(`
    INSERT INTO products (name, category, price, stock, badge, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    category.trim(),
    numericPrice,
    numericStock,
    normalizedBadge,
    normalizedDescription,
  )

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid)

  return response.status(201).json({ product: normalizeProduct(product), message: 'Product added successfully.' })
})

app.put('/api/products/:id', requireAdmin, (request, response) => {
  const productId = Number(request.params.id)
  const { name, category, price, stock, badge, description } = request.body || {}

  if (!Number.isInteger(productId) || productId <= 0) {
    return response.status(400).json({ error: 'Invalid product id.' })
  }

  const existingProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(productId)

  if (!existingProduct) {
    return response.status(404).json({ error: 'Product not found.' })
  }

  const nextName = name === undefined ? existingProduct.name : name
  const nextCategory = category === undefined ? existingProduct.category : category
  const nextPrice = price === undefined ? Number(existingProduct.price) : Number(price)
  const nextStock = stock === undefined ? existingProduct.stock : Number(stock)
  const nextBadge = badge === undefined ? existingProduct.badge : badge
  const nextDescription = description === undefined ? existingProduct.description : description

  if (!isValidText(nextName, 120)) {
    return response.status(400).json({ error: 'Product name must be 1 to 120 characters.' })
  }

  if (!isValidText(nextCategory, 80)) {
    return response.status(400).json({ error: 'Product category must be 1 to 80 characters.' })
  }

  if (!Number.isFinite(nextPrice) || nextPrice <= 0 || nextPrice > 1000000) {
    return response.status(400).json({ error: 'Product price must be between 0 and 1,000,000.' })
  }

  if (!Number.isInteger(nextStock) || nextStock < 0 || nextStock > 1000000) {
    return response.status(400).json({ error: 'Stock must be a non-negative integer no greater than 1,000,000.' })
  }

  if (!isValidText(nextBadge, 40)) {
    return response.status(400).json({ error: 'Product badge must be 1 to 40 characters.' })
  }

  if (!isValidText(nextDescription, 500)) {
    return response.status(400).json({ error: 'Product description must be 1 to 500 characters.' })
  }

  db.prepare(`
    UPDATE products
    SET name = ?, category = ?, price = ?, stock = ?, badge = ?, description = ?
    WHERE id = ?
  `).run(nextName.trim(), nextCategory.trim(), nextPrice, nextStock, nextBadge.trim(), nextDescription.trim(), productId)

  const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(productId)
  return response.json({ product: normalizeProduct(updatedProduct), message: 'Product updated successfully.' })
})

app.delete('/api/products/:id', requireAdmin, (request, response) => {
  const productId = Number(request.params.id)

  if (!Number.isInteger(productId) || productId <= 0) {
    return response.status(400).json({ error: 'Invalid product id.' })
  }

  const existingProduct = db.prepare('SELECT id FROM products WHERE id = ? AND is_active = 1').get(productId)

  if (!existingProduct) {
    return response.status(404).json({ error: 'Product not found.' })
  }

  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(productId)

  return response.json({ success: true, archivedId: productId })
})

app.put('/api/products/:id/availability', requireAdmin, (request, response) => {
  const productId = Number(request.params.id)
  const { isActive } = request.body || {}

  if (!Number.isInteger(productId) || productId <= 0) {
    return response.status(400).json({ error: 'Invalid product id.' })
  }

  if (typeof isActive !== 'boolean') {
    return response.status(400).json({ error: 'Product availability must be a boolean.' })
  }

  const result = db.prepare('UPDATE products SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, productId)

  if (result.changes === 0) {
    return response.status(404).json({ error: 'Product not found.' })
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId)
  return response.json({ product: normalizeProduct(product), message: 'Product availability updated.' })
})

app.get('/api/orders', requireUser, (request, response) => {
  const ownershipFilter = request.auth.role === 'admin' ? '' : 'WHERE o.user_id = ?'
  const query = db.prepare(
    `
      SELECT o.*, json_group_array(json_object(
        'productId', oi.product_id,
        'quantity', oi.quantity,
        'unitPrice', oi.unit_price
      )) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      ${ownershipFilter}
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `,
  )
  const orders = request.auth.role === 'admin'
    ? query.all()
    : query.all(request.auth.sub)

  response.json(orders)
})

app.put('/api/orders/:id/status', requireAdmin, (request, response) => {
  const orderId = Number(request.params.id)
  const { status } = request.body || {}
  const allowedStatuses = ['pending', 'packed', 'delivering', 'completed']

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return response.status(400).json({ error: 'Invalid order id.' })
  }

  if (!status || !allowedStatuses.includes(String(status).toLowerCase())) {
    return response.status(400).json({ error: 'Invalid order status.' })
  }

  const existingOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)

  if (!existingOrder) {
    return response.status(404).json({ error: 'Order not found.' })
  }

  const normalizedStatus = String(status).toLowerCase()
  const result = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(normalizedStatus, orderId)

  if (result.changes === 0) {
    return response.status(404).json({ error: 'Order not found.' })
  }

  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
  return response.json({ order: updatedOrder, message: 'Order status updated.' })
})

app.post('/api/auth/register', (request, response) => {
  const { name, email, password } = request.body || {}

  if (!isValidText(name, 100)) {
    return response.status(400).json({ error: 'Name must be 1 to 100 characters.' })
  }

  if (!isValidEmail(email)) {
    return response.status(400).json({ error: 'A valid email address is required.' })
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return response.status(400).json({ error: 'Password must contain 8 to 128 characters.' })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)

  if (existingUser) {
    return response.status(409).json({ error: 'An account with this email already exists.' })
  }

  const passwordHash = bcrypt.hashSync(password, 10)
  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, 'customer')
  `).run(name.trim(), normalizedEmail, passwordHash)

  const user = db.prepare('SELECT id, name, email, role, token_version FROM users WHERE id = ?').get(result.lastInsertRowid)
  const { id, name: customerName, email: customerEmail, role } = user
  const publicUser = { id, name: customerName, email: customerEmail, role }

  return response.status(201).json({
    user: publicUser,
    token: createAccessToken(user),
    message: 'Registration successful.',
  })
})

app.post('/api/auth/login', (request, response) => {
  const { email, password } = request.body || {}

  if (!isValidEmail(email)) {
    return response.status(400).json({ error: 'A valid email address is required.' })
  }

  if (typeof password !== 'string' || password.length === 0 || password.length > 128) {
    return response.status(400).json({ error: 'Password must contain 1 to 128 characters.' })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail)

  if (!user) {
    return response.status(401).json({ error: 'Invalid email or password.' })
  }

  const isValidPassword = bcrypt.compareSync(password, user.password_hash)

  if (!isValidPassword) {
    return response.status(401).json({ error: 'Invalid email or password.' })
  }

  const publicUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  }

  return response.json({
    user: publicUser,
    token: createAccessToken({ ...publicUser, token_version: user.token_version }),
    message: 'Login successful.',
  })
})

app.post('/api/orders', requireUser, (request, response) => {
  const orderBody = request.body || {}
  const { customerName, phone, address, deliveryMethod, paymentMethod, latitude, longitude, items } = orderBody

  if (paymentMethod && paymentMethod !== 'cash_on_delivery') {
    return response.status(400).json({ error: 'The selected payment method is not available.' })
  }

  const hasLatitude = Object.hasOwn(orderBody, 'latitude')
  const hasLongitude = Object.hasOwn(orderBody, 'longitude')

  if (hasLatitude !== hasLongitude) {
    return response.status(400).json({ error: 'Latitude and longitude must be provided together.' })
  }

  if (hasLatitude && (
    typeof latitude !== 'number'
    || !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || typeof longitude !== 'number'
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  )) {
    return response.status(400).json({ error: 'Coordinates are invalid or outside their allowed ranges.' })
  }

  const normalizedLatitude = hasLatitude ? latitude : null
  const normalizedLongitude = hasLongitude ? longitude : null

  if (!isValidText(customerName, 100)) {
    return response.status(400).json({ error: 'Customer name must be 1 to 100 characters.' })
  }

  if (!isValidPhone(phone)) {
    return response.status(400).json({ error: 'Enter a valid phone number with at least 7 digits.' })
  }

  if (!isValidText(address, 300)) {
    return response.status(400).json({ error: 'Delivery address must be 1 to 300 characters.' })
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return response.status(400).json({ error: 'Provide between 1 and 50 product items.' })
  }

  if (deliveryMethod !== undefined && !['standard', 'express'].includes(deliveryMethod)) {
    return response.status(400).json({ error: 'Choose a valid delivery method.' })
  }

  const normalizedDeliveryMethod = deliveryMethod || 'standard'
  const deliveryFee = normalizedDeliveryMethod === 'express' ? 40 : 20

  try {
    const requestedQuantities = new Map()

    for (const entry of items) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('Each order item must contain a product and quantity.')
      }

      const productId = Number(entry.productId)
      const quantity = Number(entry.quantity)

      if (!Number.isInteger(productId) || productId <= 0) {
        throw new Error('Invalid product selection.')
      }

      if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000) {
        throw new Error('Invalid item quantity.')
      }

      const combinedQuantity = (requestedQuantities.get(productId) || 0) + quantity

      if (combinedQuantity > 1000) {
        throw new Error('Combined product quantity is too large.')
      }

      requestedQuantities.set(productId, combinedQuantity)
    }

    const preparedItems = [...requestedQuantities].map(([productId, quantity]) => {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId)

      if (!product) {
        throw new Error('Product not found.')
      }

      if (product.stock < quantity) {
        throw new Error(`Not enough stock for ${product.name}.`)
      }

      return {
        productId,
        quantity,
        unitPrice: Number(product.price),
      }
    })

    const subtotal = preparedItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    )

    const total = subtotal + deliveryFee

    const insertOrder = db.transaction(() => {
      const orderResult = db.prepare(`
        INSERT INTO orders (customer_name, user_id, phone, address, delivery_method, payment_method, latitude, longitude, subtotal, delivery_fee, total, status)
        VALUES (?, ?, ?, ?, ?, 'cash_on_delivery', ?, ?, ?, ?, ?, 'pending')
      `).run(
        customerName.trim(),
        request.auth.sub,
        phone.trim(),
        address.trim(),
        normalizedDeliveryMethod,
        normalizedLatitude,
        normalizedLongitude,
        subtotal,
        deliveryFee,
        total,
      )

      const orderId = orderResult.lastInsertRowid
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES (?, ?, ?, ?)
      `)

      for (const item of preparedItems) {
        insertItem.run(orderId, item.productId, item.quantity, item.unitPrice)
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.quantity, item.productId)
      }

      return {
        id: Number(orderId),
        customerName: customerName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        deliveryMethod: normalizedDeliveryMethod,
        paymentMethod: 'cash_on_delivery',
        latitude: normalizedLatitude,
        longitude: normalizedLongitude,
        subtotal,
        deliveryFee,
        total,
        status: 'pending',
      }
    })

    const createdOrder = insertOrder()

    return response.status(201).json(createdOrder)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process order.'
    return response.status(400).json({ error: message })
  }
})

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename

if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`SuperMarket eNahda API running on http://localhost:${PORT}`)
  })
}

export { app }
