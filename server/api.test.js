import { createHmac, randomBytes } from 'node:crypto'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

const testSessionSecret = randomBytes(32).toString('hex')
const testAdminPassword = randomBytes(32).toString('base64url')
process.env.SESSION_SECRET = testSessionSecret
process.env.DATABASE_PATH = ':memory:'
process.env.ADMIN_EMAIL = 'admin@enahda.store'
process.env.ADMIN_PASSWORD = testAdminPassword

const { app } = await import('./index.js')

function createTestToken(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = createHmac('sha256', testSessionSecret).update(payload).digest('base64url')
  return `Bearer ${payload}.${signature}`
}

async function getAdminAuthorization() {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@enahda.store', password: testAdminPassword })

  return `Bearer ${response.body.token}`
}

async function getCustomerAuthorization() {
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Test Customer',
      email: `customer-${Date.now()}-${Math.random()}@example.test`,
      password: 'Customer@123',
    })

  return `Bearer ${response.body.token}`
}

describe('SuperMarket eNahda API', () => {
  it('should expose a product catalog endpoint', async () => {
    const response = await request(app).get('/api/products')

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body.length).toBeGreaterThan(0)
  })

  it('should authenticate an admin user with the seeded credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@enahda.store', password: testAdminPassword })
      .set('Content-Type', 'application/json')

    expect(response.status).toBe(200)
    expect(response.body.user.role).toBe('admin')
    expect(response.body.user.email).toBe('admin@enahda.store')
    expect(response.body.token).toEqual(expect.any(String))

    const sessionResponse = await request(app)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${response.body.token}`)

    expect(sessionResponse.status).toBe(200)
    expect(sessionResponse.body.user.role).toBe('admin')
  })

  it('should reject invalid order submissions', async () => {
    const response = await request(app)
      .post('/api/orders')
      .send({ customerName: '' })
      .set('Authorization', await getAdminAuthorization())
      .set('Content-Type', 'application/json')

    expect(response.status).toBe(400)
    expect(response.body.error).toBeDefined()
  })

  it('should reject malformed product, registration, and checkout input', async () => {
    const invalidProduct = await request(app)
      .post('/api/products')
      .set('Authorization', await getAdminAuthorization())
      .send({ name: { value: 'Invalid' }, category: 'Beauty', price: 10, stock: 1 })
    const invalidRegistration = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Customer', email: 'not-an-email', password: 'Customer@123' })
    const invalidCheckout = await request(app)
      .post('/api/orders')
      .set('Authorization', await getAdminAuthorization())
      .send({
        customerName: { value: 'Invalid' },
        phone: '+212600000013',
        address: 'Agadir',
        deliveryMethod: 'standard',
        items: [{ productId: 1, quantity: 1 }],
      })

    expect(invalidProduct.status).toBe(400)
    expect(invalidRegistration.status).toBe(400)
    expect(invalidCheckout.status).toBe(400)
  })

  it('should create a product for an admin user', async () => {
    const response = await request(app)
      .post('/api/products')
      .set('Content-Type', 'application/json')
      .set('Authorization', await getAdminAuthorization())
      .send({
        name: 'Fresh Mint',
        category: 'Beauty',
        price: 19,
        stock: 14,
        badge: 'New',
        description: 'A vibrant freshness for daily routines.',
      })

    expect(response.status).toBe(201)
    expect(response.body.product.name).toBe('Fresh Mint')
    expect(response.body.product.category).toBe('Beauty')
  })

  it('should reject a forged admin role without a signed token', async () => {
    const response = await request(app)
      .post('/api/products')
      .set('Content-Type', 'application/json')
      .set('x-user-role', 'admin')
      .send({
        name: 'Forbidden Product',
        category: 'Beauty',
        price: 15,
        stock: 10,
        badge: 'New',
        description: 'This should fail.',
      })

    expect(response.status).toBe(403)
    expect(response.body.error).toBeDefined()
  })

  it('should allow an admin to update an order status', async () => {
    const orderCreate = await request(app)
      .post('/api/orders')
      .set('Authorization', await getAdminAuthorization())
      .send({
        customerName: 'Laila N.',
        phone: '+212600000010',
        address: 'Agadir',
        deliveryMethod: 'standard',
        items: [{ productId: 1, quantity: 1 }],
      })
      .set('Content-Type', 'application/json')

    const response = await request(app)
      .put(`/api/orders/${orderCreate.body.id}/status`)
      .set('Content-Type', 'application/json')
      .set('Authorization', await getAdminAuthorization())
      .send({ status: 'packed' })

    expect(response.status).toBe(200)
    expect(response.body.order.status).toBe('packed')
  })

  it('should reject order status updates from non-admin users', async () => {
    const response = await request(app)
      .put('/api/orders/1/status')
      .set('Content-Type', 'application/json')
      .set('Authorization', await getCustomerAuthorization())
      .send({ status: 'packed' })

    expect(response.status).toBe(403)
    expect(response.body.error).toBeDefined()
  })

  it('should reject expired sessions and role claims changed after signing', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@enahda.store', password: testAdminPassword })
    const token = loginResponse.body.token
    const [payload, signature] = token.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    const modifiedRole = Buffer.from(JSON.stringify({ ...claims, role: 'customer' })).toString('base64url')
    const invalidAuthorization = `Bearer ${modifiedRole}.${signature}`
    const expiredAuthorization = createTestToken({ ...claims, exp: Math.floor(Date.now() / 1000) - 1 })
    const modifiedRoleResponse = await request(app)
      .post('/api/products')
      .set('Authorization', invalidAuthorization)
      .send({ name: 'Tampered', category: 'Beauty', price: 10, stock: 1 })
    const expiredTokenResponse = await request(app)
      .post('/api/products')
      .set('Authorization', expiredAuthorization)
      .send({ name: 'Expired', category: 'Beauty', price: 10, stock: 1 })

    expect(modifiedRoleResponse.status).toBe(403)
    expect(expiredTokenResponse.status).toBe(403)
  })

  it('should use the database role instead of a signed token role claim', async () => {
    const customerAuthorization = await getCustomerAuthorization()
    const customerToken = customerAuthorization.slice('Bearer '.length)
    const [payload] = customerToken.split('.')
    const customerClaims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    const tokenWithAdminClaim = createTestToken({ ...customerClaims, role: 'admin' })
    const response = await request(app)
      .post('/api/products')
      .set('Authorization', tokenWithAdminClaim)
      .send({ name: 'Forged Role', category: 'Beauty', price: 10, stock: 1 })

    expect(response.status).toBe(403)
  })

  it('should revoke a bearer token on logout without blocking a fresh login', async () => {
    const oldAuthorization = await getAdminAuthorization()
    const logoutResponse = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', oldAuthorization)
    const oldSessionResponse = await request(app)
      .get('/api/auth/session')
      .set('Authorization', oldAuthorization)
    const freshAuthorization = await getAdminAuthorization()
    const freshSessionResponse = await request(app)
      .get('/api/auth/session')
      .set('Authorization', freshAuthorization)

    expect(logoutResponse.status).toBe(200)
    expect(oldSessionResponse.status).toBe(401)
    expect(freshSessionResponse.status).toBe(200)
  })

  it('should require authentication and limit customer order history to its owner', async () => {
    const unauthenticatedResponse = await request(app).get('/api/orders')
    expect(unauthenticatedResponse.status).toBe(401)

    const orderResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', await getAdminAuthorization())
      .send({
        customerName: 'Admin Test Order',
        phone: '+212600000011',
        address: 'Agadir',
        deliveryMethod: 'standard',
        latitude: 30.4278,
        longitude: -9.5981,
        items: [{ productId: 1, quantity: 1 }],
      })
    const customerHistory = await request(app)
      .get('/api/orders')
      .set('Authorization', await getCustomerAuthorization())
    const adminHistory = await request(app)
      .get('/api/orders')
      .set('Authorization', await getAdminAuthorization())

    expect(orderResponse.status).toBe(201)
    expect(orderResponse.body.paymentMethod).toBe('cash_on_delivery')
    expect(customerHistory.status).toBe(200)
    expect(customerHistory.body).toEqual([])
    expect(adminHistory.body.some((order) => order.id === orderResponse.body.id)).toBe(true)
    expect(adminHistory.body.find((order) => order.id === orderResponse.body.id).latitude).toBe(30.4278)
  })

  it('should reject unsupported payment methods', async () => {
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', await getAdminAuthorization())
      .send({
        customerName: 'Payment Test',
        phone: '+212600000012',
        address: 'Agadir',
        deliveryMethod: 'standard',
        paymentMethod: 'card',
        items: [{ productId: 1, quantity: 1 }],
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toMatch(/payment method/i)
  })

  it('should accept manual-address checkout without coordinates', async () => {
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', await getCustomerAuthorization())
      .send({
        customerName: 'Manual Address Customer',
        phone: '+212600000020',
        address: '12 Rue Manual, Agadir',
        deliveryMethod: 'standard',
        items: [{ productId: 1, quantity: 1 }],
      })

    expect(response.status).toBe(201)
    expect(response.body.address).toBe('12 Rue Manual, Agadir')
    expect(response.body.latitude).toBeNull()
    expect(response.body.longitude).toBeNull()
  })

  it('should persist valid GPS coordinates with the delivery order', async () => {
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', await getCustomerAuthorization())
      .send({
        customerName: 'GPS Customer',
        phone: '+212600000021',
        address: 'Agadir, near the market',
        deliveryMethod: 'standard',
        latitude: 30.4278,
        longitude: -9.5981,
        items: [{ productId: 1, quantity: 1 }],
      })
      .then(async (orderResponse) => {
        const authorization = await getAdminAuthorization()
        const orderList = await request(app).get('/api/orders').set('Authorization', authorization)
        return { orderResponse, orderList }
      })

    expect(response.orderResponse.status).toBe(201)
    expect(response.orderResponse.body.latitude).toBe(30.4278)
    expect(response.orderResponse.body.longitude).toBe(-9.5981)
    const storedOrder = response.orderList.body.find((order) => order.id === response.orderResponse.body.id)
    expect(storedOrder.latitude).toBe(30.4278)
    expect(storedOrder.longitude).toBe(-9.5981)
  })

  it('should reject invalid, partial, and out-of-range coordinates', async () => {
    const authorization = await getAdminAuthorization()
    const baseOrder = {
      customerName: 'Invalid Coordinates Customer',
      phone: '+212600000022',
      address: 'Agadir',
      deliveryMethod: 'standard',
      items: [{ productId: 1, quantity: 1 }],
    }
    const invalidPayloads = [
      { latitude: 90.01, longitude: 0 },
      { latitude: 0, longitude: -180.01 },
      { latitude: 30, longitude: null },
      { latitude: null, longitude: null },
      { latitude: '30.4', longitude: '-9.6' },
    ]
    const responses = await Promise.all(invalidPayloads.map((coordinates) => request(app)
      .post('/api/orders')
      .set('Authorization', authorization)
      .send({ ...baseOrder, ...coordinates })))

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 400])
  })

  it('should allow an admin to update a product', async () => {
    const createResponse = await request(app)
      .post('/api/products')
      .set('Content-Type', 'application/json')
      .set('Authorization', await getAdminAuthorization())
      .send({
        name: 'Lemon Fresh',
        category: 'Beverages',
        price: 26,
        stock: 9,
        badge: 'New',
        description: 'Bright and zesty.',
      })

    const response = await request(app)
      .put(`/api/products/${createResponse.body.product.id}`)
      .set('Content-Type', 'application/json')
      .set('Authorization', await getAdminAuthorization())
      .send({
        name: 'Lemon Fresh Premium',
        price: 32,
        stock: 12,
      })

    expect(response.status).toBe(200)
    expect(response.body.product.name).toBe('Lemon Fresh Premium')
    expect(response.body.product.price).toBe(32)
    expect(response.body.product.stock).toBe(12)
  })

  it('should archive products from the public catalog and restore them for sale', async () => {
    const authorization = await getAdminAuthorization()
    const createResponse = await request(app)
      .post('/api/products')
      .set('Authorization', authorization)
      .send({ name: 'Archive Check', category: 'Beauty', price: 15, stock: 8 })
    const productId = createResponse.body.product.id
    const archiveResponse = await request(app)
      .delete(`/api/products/${productId}`)
      .set('Authorization', authorization)
    const publicCatalogWhileArchived = await request(app).get('/api/products')
    const adminCatalogWhileArchived = await request(app)
      .get('/api/admin/products')
      .set('Authorization', authorization)
    const restoreResponse = await request(app)
      .put(`/api/products/${productId}/availability`)
      .set('Authorization', authorization)
      .send({ isActive: true })
    const publicCatalogAfterRestore = await request(app).get('/api/products')

    expect(createResponse.status).toBe(201)
    expect(archiveResponse.status).toBe(200)
    expect(publicCatalogWhileArchived.body.some((product) => product.id === productId)).toBe(false)
    expect(adminCatalogWhileArchived.body.find((product) => product.id === productId).isActive).toBe(false)
    expect(restoreResponse.status).toBe(200)
    expect(publicCatalogAfterRestore.body.some((product) => product.id === productId)).toBe(true)
  })
})
