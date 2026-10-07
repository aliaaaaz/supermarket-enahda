import './App.css'
import { useEffect, useState } from 'react'
import { requestCurrentLocation } from './geolocation.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const categories = [
  { name: 'Fruits & Veg', icon: '🥬', color: 'green' },
  { name: 'Bakery', icon: '🥐', color: 'yellow' },
  { name: 'Dairy', icon: '🥛', color: 'green' },
  { name: 'Household', icon: '🧻', color: 'yellow' },
  { name: 'Beverages', icon: '🥤', color: 'green' },
  { name: 'Beauty', icon: '🧴', color: 'yellow' },
]

const productIconMap = {
  'Organic Tomatoes': '🍅',
  'Farmer Eggs': '🥚',
  'Moroccan Bread': '🥖',
  'Orange Juice': '🧃',
  'Hand Soap': '🧼',
}

const paymentMethods = ['Cash on delivery']

const customerAccount = {
  title: 'Customer account',
  subtitle: 'Access your orders, saved details, and profile in one place.',
}

const promotions = [
  { title: 'Local delivery', text: 'Choose standard or express delivery at checkout.' },
  { title: 'Order history', text: 'Review your previous purchases after signing in.' },
  { title: 'Pay on delivery', text: 'Cash is collected when your order arrives.' },
]

function getTokenExpiration(token) {
  try {
    const encodedPayload = token.split('.')[0]
    const base64Payload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = base64Payload.padEnd(Math.ceil(base64Payload.length / 4) * 4, '=')
    return Number(JSON.parse(atob(paddedPayload)).exp) || 0
  } catch {
    return 0
  }
}

function readStoredSession() {
  const savedUser = localStorage.getItem('enahda-user')
  const savedToken = localStorage.getItem('enahda-token')

  if (!savedUser || !savedToken || getTokenExpiration(savedToken) * 1000 <= Date.now()) {
    localStorage.removeItem('enahda-user')
    localStorage.removeItem('enahda-token')
    return { user: null, token: '' }
  }

  try {
    return { user: JSON.parse(savedUser), token: savedToken }
  } catch {
    localStorage.removeItem('enahda-user')
    localStorage.removeItem('enahda-token')
    return { user: null, token: '' }
  }
}

function App() {
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [detailQuantity, setDetailQuantity] = useState(1)
  const [cart, setCart] = useState([])
  const [checkoutForm, setCheckoutForm] = useState({
    fullName: '',
    phone: '',
    address: '',
    deliveryMethod: 'standard',
    paymentMethod: 'Cash on delivery',
  })
  const [deliveryCoordinates, setDeliveryCoordinates] = useState(null)
  const [locationStatus, setLocationStatus] = useState('idle')
  const [locationMessage, setLocationMessage] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' })
  const [authMessage, setAuthMessage] = useState('')
  const [authSession, setAuthSession] = useState(readStoredSession)
  const authUser = authSession.user
  const authToken = authSession.token
  const [verifiedUser, setVerifiedUser] = useState(null)
  const [orderMessage, setOrderMessage] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [showAllProducts, setShowAllProducts] = useState(false)
  const [productEditorOpen, setProductEditorOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)
  const [productDraft, setProductDraft] = useState({ name: '', category: '', price: '', stock: '', badge: 'New', description: '' })
  const [productFormError, setProductFormError] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [liveOrders, setLiveOrders] = useState([])
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    let isMounted = true

    fetch(`${API_BASE_URL}/api/products`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to load products')
        }

        return response.json()
      })
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setProducts(data)
          setSelectedProduct(data[0] || null)
          setCatalogError('')
        }
      })
      .catch((error) => {
        if (isMounted) {
          setProducts([])
          setSelectedProduct(null)
          setCatalogError(error.message || 'Unable to load the product catalog.')
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!authToken) {
      return undefined
    }

    let isMounted = true

    fetch(`${API_BASE_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Session expired. Please sign in again.')
        }

        return response.json()
      })
      .then((payload) => {
        if (isMounted) {
          setVerifiedUser(payload.user)
          setAuthSession((currentSession) => currentSession.token === authToken
            ? { user: payload.user, token: authToken }
            : currentSession)
        }
      })
      .catch(() => {
        if (isMounted) {
          setVerifiedUser(null)
          setAuthSession((currentSession) => currentSession.token === authToken
            ? { user: null, token: '' }
            : currentSession)
          setLiveOrders([])
          setAuthMessage('Session expired. Please sign in again.')
        }
      })

    return () => {
      isMounted = false
    }
  }, [authToken])

  useEffect(() => {
    if (!authToken) {
      return undefined
    }

    const millisecondsUntilExpiration = getTokenExpiration(authToken) * 1000 - Date.now()
    const expirationTimer = window.setTimeout(() => {
      setVerifiedUser(null)
      setAuthSession((currentSession) => currentSession.token === authToken
        ? { user: null, token: '' }
        : currentSession)
      setLiveOrders([])
      setAuthMessage('Session expired. Please sign in again.')
    }, Math.max(0, millisecondsUntilExpiration))

    return () => window.clearTimeout(expirationTimer)
  }, [authToken])

  useEffect(() => {
    if (!authToken) {
      return undefined
    }

    let isMounted = true

    fetch(`${API_BASE_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to load orders')
        }

        return response.json()
      })
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setLiveOrders(data)
        }
      })
      .catch(() => {
        if (isMounted) {
          setLiveOrders([])
        }
      })

    return () => {
      isMounted = false
    }
  }, [authToken])

  useEffect(() => {
    if (!authToken || verifiedUser?.role !== 'admin') {
      return undefined
    }

    let isMounted = true

    fetch(`${API_BASE_URL}/api/admin/products`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to load inventory.')
        }

        return response.json()
      })
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setProducts(data)
          setSelectedProduct((currentProduct) => currentProduct || data.find((product) => product.isActive) || null)
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [authToken, verifiedUser?.role])

  useEffect(() => {
    if (authUser && authToken) {
      localStorage.setItem('enahda-user', JSON.stringify(authUser))
      localStorage.setItem('enahda-token', authToken)
      return
    }

    localStorage.removeItem('enahda-user')
    localStorage.removeItem('enahda-token')
  }, [authUser, authToken])

  const productMap = Object.fromEntries(products.map((product) => [product.id, product]))
  const cartEntries = cart.map((entry) => ({
    ...entry,
    product: productMap[entry.id],
  })).filter((entry) => entry.product)

  const addToCart = (product, quantity = 1) => {
    const currentQuantity = cart.find((item) => item.id === product.id)?.quantity || 0

    if (currentQuantity + quantity > Number(product.stock)) {
      setOrderMessage('The requested quantity is not available in stock.')
      return
    }

    setOrderMessage('')
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.id === product.id)

      if (existingItem) {
        return currentCart.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item))
      }

      return [...currentCart, { id: product.id, quantity }]
    })
  }

  const updateCartItem = (productId, delta) => {
    setCart((currentCart) =>
      currentCart
        .map((item) => {
          if (item.id !== productId) {
            return item
          }

          return { ...item, quantity: Math.max(0, item.quantity + delta) }
        })
        .filter((item) => item.quantity > 0),
    )
  }

  const subtotal = cartEntries.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  const delivery = cartEntries.length === 0 ? 0 : checkoutForm.deliveryMethod === 'express' ? 40 : 20
  const total = subtotal + delivery

  const handleInputChange = (event) => {
    const { name, value } = event.target
    setCheckoutForm((current) => ({ ...current, [name]: value }))
  }

  const handleUseCurrentLocation = async () => {
    setLocationStatus('loading')
    setLocationMessage('')

    try {
      const coordinates = await requestCurrentLocation()
      setDeliveryCoordinates(coordinates)
      setLocationStatus('selected')
      setLocationMessage('Current location selected. You can still edit the delivery address.')
    } catch (error) {
      setLocationStatus('error')
      setLocationMessage(error.message || 'Unable to get your location. Enter the address manually.')
    }
  }

  const handleClearCurrentLocation = () => {
    setDeliveryCoordinates(null)
    setLocationStatus('idle')
    setLocationMessage('GPS location cleared. The delivery address remains unchanged.')
  }

  const handleAuthInputChange = (event) => {
    const { name, value } = event.target
    setAuthForm((current) => ({ ...current, [name]: value }))
  }

  const handleRegisterInputChange = (event) => {
    const { name, value } = event.target
    setRegisterForm((current) => ({ ...current, [name]: value }))
  }

  const handleAuthSubmit = async () => {
    if (authMode === 'register') {
      if (!registerForm.name.trim() || !registerForm.email.trim() || !registerForm.password.trim()) {
        setAuthMessage('Please complete your name, email, and password.')
        return
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: registerForm.name,
            email: registerForm.email,
            password: registerForm.password,
          }),
        })

        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error || 'Unable to create account.')
        }

        setAuthSession({ user: payload.user, token: payload.token })
        setVerifiedUser(payload.user)
        setAuthMessage(`Account created successfully, ${payload.user.name}.`)
        setRegisterForm({ name: '', email: '', password: '' })
        setAuthMode('login')
        return
      } catch (error) {
        setAuthMessage(error.message || 'Unable to create account.')
        return
      }
    }

    if (!authForm.email.trim() || !authForm.password.trim()) {
      setAuthMessage('Please enter your email and password.')
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to sign in.')
      }

      setAuthSession({ user: payload.user, token: payload.token })
      setVerifiedUser(payload.user)
      setAuthMessage(`Welcome back, ${payload.user.name}.`)
      setAuthForm({ email: '', password: '' })
    } catch (error) {
      setAuthMessage(error.message || 'Unable to sign in.')
    }
  }

  const handleProceedToCheckout = () => {
    if (!authUser) {
      setOrderMessage('Please sign in before checkout.')
      document.getElementById('account')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (cartEntries.length === 0) {
      setOrderMessage('Please add at least one product before checkout.')
      return
    }

    setOrderMessage('')
    document.getElementById('checkout-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleCheckout = async () => {
    if (!authUser) {
      setOrderMessage('Please sign in before placing your order.')
      document.getElementById('account')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (cartEntries.length === 0) {
      setOrderMessage('Please add at least one product before checkout.')
      return
    }

    if (!checkoutForm.fullName.trim() || !checkoutForm.phone.trim() || !checkoutForm.address.trim()) {
      setOrderMessage('Please complete your full name, phone number, and address.')
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          customerName: checkoutForm.fullName,
          phone: checkoutForm.phone,
          address: checkoutForm.address,
          deliveryMethod: checkoutForm.deliveryMethod,
          paymentMethod: 'cash_on_delivery',
          ...(deliveryCoordinates || {}),
          items: cartEntries.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to place order.')
      }

      setOrderMessage(`Order #${payload.id} created successfully. Thank you!`)
      setLiveOrders((currentOrders) => [payload, ...currentOrders])
      setCart([])
      setCheckoutForm({
        fullName: '',
        phone: '',
        address: '',
        deliveryMethod: 'standard',
        paymentMethod: 'Cash on delivery',
      })
      setDeliveryCoordinates(null)
      setLocationStatus('idle')
      setLocationMessage('')
    } catch (error) {
      setOrderMessage(error.message || 'Unable to place order. Please try again.')
    }
  }

  const handleLogout = () => {
    fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    }).catch(() => {})
    setAuthSession({ user: null, token: '' })
    setVerifiedUser(null)
    setLiveOrders([])
    setAuthMessage('You have been signed out.')
    setAuthMode('login')
  }

  const handleStatusChange = async (orderId, nextStatus) => {
    if (!verifiedUser || verifiedUser.role !== 'admin') {
      setOrderMessage('Admin access is required to update order statuses.')
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to update order status.')
      }

      setLiveOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === orderId ? { ...order, status: payload.order.status } : order,
        ),
      )
      setOrderMessage(`Order #${orderId} marked as ${nextStatus}.`)
    } catch (error) {
      setOrderMessage(error.message || 'Unable to update order status.')
    }
  }

  const handleExportReport = () => {
    const rows = [
      ['Order', 'Customer', 'Status', 'Total MAD', 'Created at'],
      ...liveOrders.map((order) => [
        order.id,
        order.customer_name || order.customerName || '',
        order.status,
        Number(order.total).toFixed(2),
        order.created_at || '',
      ]),
    ]
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const downloadUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const downloadLink = document.createElement('a')
    downloadLink.href = downloadUrl
    downloadLink.download = 'enahda-orders.csv'
    downloadLink.click()
    URL.revokeObjectURL(downloadUrl)
  }

  const handleAddProduct = () => {
    if (!verifiedUser || verifiedUser.role !== 'admin') {
      setOrderMessage('Admin access is required to add products.')
      return
    }

    setProductDraft({ name: '', category: '', price: '', stock: '', badge: 'New', description: '' })
    setEditingProductId(null)
    setProductFormError('')
    setProductEditorOpen(true)
  }

  const handleEditProduct = (productId) => {
    if (!verifiedUser || verifiedUser.role !== 'admin') {
      setOrderMessage('Admin access is required to edit products.')
      return
    }

    const targetProduct = products.find((product) => product.id === productId)

    if (!targetProduct) {
      setOrderMessage('Product not found.')
      return
    }

    setProductDraft({
      name: targetProduct.name,
      category: targetProduct.category,
      price: String(targetProduct.price),
      stock: String(targetProduct.stock),
      badge: targetProduct.badge,
      description: targetProduct.description,
    })
    setEditingProductId(productId)
    setProductFormError('')
    setProductEditorOpen(true)
  }

  const handleProductDraftChange = (event) => {
    const { name, value } = event.target
    setProductDraft((currentDraft) => ({ ...currentDraft, [name]: value }))
  }

  const handleSaveProduct = async (event) => {
    event.preventDefault()

    if (!productDraft.name.trim() || !productDraft.category.trim() || !productDraft.badge.trim() || !productDraft.description.trim()) {
      setProductFormError('Complete all product fields.')
      return
    }

    const price = Number(productDraft.price)
    const stock = Number(productDraft.stock)

    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
      setProductFormError('Enter a valid positive price and non-negative whole-number stock.')
      return
    }

    const productPayload = { ...productDraft, price, stock }
    const isEditing = editingProductId !== null

    try {
      const response = await fetch(
        isEditing ? `${API_BASE_URL}/api/products/${editingProductId}` : `${API_BASE_URL}/api/products`,
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(productPayload),
        },
      )

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save product.')
      }

      const savedProduct = payload.product

      setProducts((currentProducts) => isEditing
        ? currentProducts.map((product) => product.id === savedProduct.id ? savedProduct : product)
        : [...currentProducts, savedProduct])
      setSelectedProduct(savedProduct)
      setProductEditorOpen(false)
      setOrderMessage(isEditing ? `${savedProduct.name} updated.` : `${savedProduct.name} added.`)
    } catch (error) {
      setProductFormError(error.message || 'Unable to save product.')
    }
  }

  const handleArchiveProduct = async (productId) => {
    if (!verifiedUser || verifiedUser.role !== 'admin') {
      setOrderMessage('Admin access is required to archive products.')
      return
    }

    if (!window.confirm('Archive this product from the storefront?')) {
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${productId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to archive product.')
      }

      setProducts((currentProducts) => currentProducts.map((product) =>
        product.id === productId ? { ...product, isActive: false } : product,
      ))
      setOrderMessage(`Product ${payload.archivedId} archived.`)
    } catch (error) {
      setOrderMessage(error.message || 'Unable to archive product.')
    }
  }

  const handleProductAvailabilityChange = async (productId, isActive) => {
    if (!verifiedUser || verifiedUser.role !== 'admin') {
      setOrderMessage('Admin access is required to change product availability.')
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${productId}/availability`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ isActive }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to change product availability.')
      }

      setProducts((currentProducts) => currentProducts.map((product) =>
        product.id === productId ? payload.product : product,
      ))
      setOrderMessage(`${payload.product.name} ${isActive ? 'restored' : 'archived'}.`)
    } catch (error) {
      setOrderMessage(error.message || 'Unable to change product availability.')
    }
  }

  const activeProducts = products.filter((product) => product.isActive !== false)
  const categoryOptions = ['All', ...new Set(activeProducts.map((product) => product.category))]

  const filteredProducts = activeProducts.filter((product) => {
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory
    const normalizedQuery = searchTerm.trim().toLowerCase()
    const matchesSearch = !normalizedQuery || product.name.toLowerCase().includes(normalizedQuery) || product.category.toLowerCase().includes(normalizedQuery)

    return matchesCategory && matchesSearch
  })

  const featuredProducts = (showAllProducts ? filteredProducts : filteredProducts.slice(0, 4)).map((product) => ({
    ...product,
    price: Number(product.price).toFixed(2),
    unit: product.category === 'Bakery' ? 'pack' : product.category === 'Dairy' ? 'box' : product.category === 'Beverages' ? 'bottle' : 'kg',
    badge: product.badge,
    image: productIconMap[product.name] || '🛒',
  }))

  const inventoryRows = activeProducts.filter((product) => product.stock <= 20).slice(0, 4).map((product) => ({
    id: product.id,
    name: product.name,
    stock: `${product.stock} units`,
    status: product.stock <= 20 ? 'Low' : 'Healthy',
  }))

  const managedProducts = products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    price: `${Number(product.price).toFixed(2)} MAD`,
    stock: `${product.stock} units`,
    isActive: product.isActive !== false,
    status: product.isActive === false ? 'Archived' : product.stock <= 20 ? 'Low stock' : 'In stock',
  }))

  const productDetail = selectedProduct
    ? {
        name: selectedProduct.name,
        price: Number(selectedProduct.price).toFixed(2),
        unit: 'Per unit',
        badge: selectedProduct.badge,
        image: productIconMap[selectedProduct.name] || '🛒',
        description: selectedProduct.description,
        details: [`${selectedProduct.stock} units in stock`, selectedProduct.category, 'Cash on delivery'],
      }
    : null

  const isAdmin = verifiedUser?.role === 'admin'
  const adminRecentOrders = liveOrders.map((order) => ({
        id: `#${order.id}`,
        customer: order.customer_name || order.customerName,
        status: order.status,
        total: `${Number(order.total).toFixed(0)} MAD`,
      }))
  const todaysOrders = liveOrders.filter((order) => order.created_at?.slice(0, 10) === today)
  const adminMetrics = [
    { label: 'Orders today', value: String(todaysOrders.length) },
    { label: 'Revenue today', value: `${todaysOrders.reduce((sum, order) => sum + Number(order.total), 0).toFixed(0)} MAD` },
    { label: 'Low-stock products', value: String(activeProducts.filter((product) => product.stock <= 20).length) },
    { label: 'Active products', value: String(activeProducts.length) },
  ]

  const customerOrderHistory = liveOrders.slice(0, 4).map((order) => ({
    id: `#${order.id}`,
    status: order.status,
    total: `${Number(order.total).toFixed(0)} MAD`,
  }))

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand-block">
            <div className="brand-mark">e</div>
            <div>
              <p className="brand-name">SuperMarket eNahda</p>
              <span className="brand-tag">Fresh • Fast • Trusted</span>
            </div>
          </div>

          <nav className="main-nav" aria-label="Main navigation">
            <a href="#home">Home</a>
            <a href="#categories">Categories</a>
            <a href="#offers">Offers</a>
            <a href="#products">Products</a>
            <a href="#contact">Contact</a>
          </nav>

          <div className="top-actions">
            <button
              className="ghost-button cart-pill"
              type="button"
              aria-label="Shopping cart"
              onClick={() => document.getElementById('cart')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              🛒 <span>{cart.reduce((total, item) => total + item.quantity, 0)}</span>
            </button>

            {authUser ? (
              <div className="user-badge">
                <span>Hi, {authUser.name.split(' ')[0]}</span>
                <button type="button" className="ghost-button small" onClick={handleLogout}>Logout</button>
              </div>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={() => document.getElementById('account')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="page container" id="home">
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow">Open daily • 09:00 - 23:00</span>
            <h1>Groceries made smarter for your everyday life.</h1>
            <p>
              Discover fresh products, local essentials, and daily deals from
              SuperMarket eNahda — designed for easy shopping in Agadir.
            </p>

            <div className="hero-actions">
              <button
                className="primary-button large"
                type="button"
                onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >Shop now</button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => document.getElementById('offers')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >Browse offers</button>
            </div>

            <div className="mini-stats">
              <div>
                <strong>{products.length}</strong>
                <span>Products</span>
              </div>
              <div>
                <strong>{Math.max(categoryOptions.length - 1, 0)}</strong>
                <span>Categories</span>
              </div>
              <div>
                <strong>2</strong>
                <span>Delivery options</span>
              </div>
            </div>
          </div>

          <div className="hero-visual" aria-label="Market illustration">
            <div className="basket-card">
              <div className="basket-header">
                <span className="status-dot" />
                <span>Order summary</span>
              </div>

              {cartEntries.length > 0 ? cartEntries.slice(0, 2).map((item) => (
                <div className="basket-item" key={item.id}>
                  <span className="basket-icon">{productIconMap[item.product.name] || '🛒'}</span>
                  <div>
                    <strong>{item.product.name}</strong>
                    <small>{item.quantity} item(s)</small>
                  </div>
                  <span>{(item.quantity * item.product.price).toFixed(0)} MAD</span>
                </div>
              )) : (
                <p className="basket-empty">Your cart is empty.</p>
              )}

              <div className="basket-total">
                <span>Total</span>
                <strong>{total.toFixed(0)} MAD</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="feature-band" id="offers">
          {promotions.map((promo) => (
            <article className="feature-card" key={promo.title}>
              <span className="feature-icon">✓</span>
              <div>
                <h3>{promo.title}</h3>
                <p>{promo.text}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="categories-section" id="categories">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Explore</span>
              <h2>Browse by category</h2>
            </div>
            <a href="#products">View all</a>
          </div>

          <div className="categories-grid">
            {categories.map((category) => (
              <article key={category.name} className={`category-card ${category.color}`}>
                <span className="category-icon">{category.icon}</span>
                <h3>{category.name}</h3>
                <p>Fresh essentials for your home</p>
              </article>
            ))}
          </div>
        </section>

        <section className="products-section" id="products">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Popular now</span>
              <h2>Featured products</h2>
            </div>
            {filteredProducts.length > 4 ? (
              <button className="text-link" type="button" onClick={() => setShowAllProducts((current) => !current)}>
                {showAllProducts ? 'Show less' : 'See more'}
              </button>
            ) : null}
          </div>

          <div className="search-tools">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search groceries or categories"
              aria-label="Search products"
            />
          </div>

          {catalogError ? <p className="order-status" role="alert">{catalogError}</p> : null}

          <div className="category-filters" aria-label="Product category filters">
            {categoryOptions.map((category) => (
              <button
                key={category}
                type="button"
                className={selectedCategory === category ? 'active' : ''}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {featuredProducts.length === 0 ? (
            <div className="empty-state">
              {catalogError ? 'The catalog is unavailable right now.' : activeProducts.length === 0 ? 'No products are currently available.' : 'No products match your search. Try another category or keyword.'}
            </div>
          ) : (
            <div className="products-grid">
              {featuredProducts.map((product) => (
                <article
                  className="product-card"
                  key={product.id}
                  onClick={() => {
                    setSelectedProduct(productMap[product.id] || product)
                    setDetailQuantity(1)
                    document.getElementById('product-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="product-image" aria-hidden="true">{product.image}</div>
                  <span className="product-badge">{product.badge}</span>
                  <h3>{product.name}</h3>
                  <div className="product-meta">
                    <span>{product.unit}</span>
                    <span>{product.stock} in stock</span>
                  </div>
                  <div className="product-footer">
                    <strong>{product.price} MAD</strong>
                    <button type="button" onClick={(event) => {
                      event.stopPropagation()
                      addToCart(product)
                    }}>
                      Add
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {productDetail ? (
        <section className="detail-section" id="product-detail" aria-label="Product detail view">
          <div className="detail-card">
            <div className="detail-media">
              <div className="detail-highlight">{productDetail.image}</div>
            </div>

            <div className="detail-content">
              <span className="product-badge detail-badge">{productDetail.badge}</span>
              <h2>{productDetail.name}</h2>
              <div className="detail-price-row">
                <strong>{productDetail.price} MAD</strong>
                <span>{productDetail.unit}</span>
              </div>

              <p className="detail-description">{productDetail.description}</p>

              <div className="detail-features" aria-label="Product features">
                {productDetail.details.map((detail) => (
                  <span key={detail}>{detail}</span>
                ))}
              </div>

              <div className="detail-actions">
                <div className="quantity-selector" aria-label="Quantity selector">
                  <button type="button" aria-label="Decrease quantity" disabled={detailQuantity <= 1} onClick={() => setDetailQuantity((quantity) => Math.max(1, quantity - 1))}>−</button>
                  <span>{detailQuantity}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={detailQuantity >= Number(selectedProduct?.stock || 0)}
                    onClick={() => setDetailQuantity((quantity) => Math.min(Number(selectedProduct?.stock || 0), quantity + 1))}
                  >+</button>
                </div>

                <button
                  className="primary-button large"
                  type="button"
                  disabled={!selectedProduct || selectedProduct.stock < 1}
                  onClick={() => addToCart(selectedProduct, detailQuantity)}
                >
                  {selectedProduct?.stock > 0 ? 'Add to cart' : 'Out of stock'}
                </button>
              </div>
            </div>
          </div>
        </section>
        ) : null}

        <section className="cart-section" id="cart" aria-label="Shopping cart summary">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Your cart</span>
              <h2>Ready for checkout</h2>
            </div>
          </div>

          <div className="cart-layout">
            <div className="cart-items-panel">
              {cartEntries.length === 0 ? (
                <div className="cart-empty">Your cart is empty. Add a few fresh items to continue.</div>
              ) : (
                cartEntries.map((item) => (
                  <div className="cart-item" key={item.id}>
                    <div className="cart-item-main">
                      <span className="cart-item-image" aria-hidden="true">{productIconMap[item.product.name] || '🛒'}</span>
                      <div>
                        <h3>{item.product.name}</h3>
                        <p>{item.quantity} item(s)</p>
                      </div>
                    </div>

                    <div className="cart-item-actions">
                      <button type="button" onClick={() => updateCartItem(item.id, -1)}>−</button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        disabled={item.quantity >= item.product.stock}
                        onClick={() => updateCartItem(item.id, 1)}
                      >+</button>
                    </div>

                    <strong>{item.quantity * item.product.price} MAD</strong>
                  </div>
                ))
              )}
            </div>

            <aside className="cart-summary">
              <h3>Order summary</h3>

              <div className="summary-row">
                <span>Subtotal</span>
                <strong>{subtotal} MAD</strong>
              </div>

              <div className="summary-row">
                <span>Delivery</span>
                <strong>{delivery} MAD</strong>
              </div>

              <div className="summary-row total-row">
                <span>Total</span>
                <strong>{total} MAD</strong>
              </div>

              <button className="primary-button large full-width" type="button" onClick={handleProceedToCheckout}>
                Proceed to checkout
              </button>
            </aside>
          </div>
        </section>

        <section className="checkout-section" aria-label="Checkout form">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Checkout</span>
              <h2>Confirm your order</h2>
            </div>
          </div>

          <div className="checkout-layout">
            <form id="checkout-form" className="checkout-form">
              <div className="input-group">
                <label htmlFor="fullName">Full name</label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  value={checkoutForm.fullName}
                  onChange={handleInputChange}
                  placeholder="Mohamed El Idrissi"
                />
              </div>

              <div className="input-group">
                <label htmlFor="phone">Phone number</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={checkoutForm.phone}
                  onChange={handleInputChange}
                  placeholder="+212 6 00 00 00 00"
                />
              </div>

              <div className="input-group address-input-group">
                <div className="address-field-heading">
                  <label htmlFor="address">Delivery address</label>
                  <button
                    className="location-button"
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={locationStatus === 'loading'}
                    aria-busy={locationStatus === 'loading'}
                  >
                    {locationStatus === 'loading' ? 'Getting location...' : 'Use my current location'}
                  </button>
                </div>
                <textarea
                  id="address"
                  name="address"
                  rows="3"
                  maxLength="300"
                  value={checkoutForm.address}
                  onChange={handleInputChange}
                  placeholder="24 Rue ... , Agadir"
                />
                {locationMessage ? (
                  <p className={`location-message ${locationStatus}`} role="status" aria-live="polite">
                    {locationMessage}
                  </p>
                ) : null}
                {deliveryCoordinates ? (
                  <div className="selected-location" aria-label="Selected GPS delivery location">
                    <strong>GPS delivery point</strong>
                    <span>Latitude {deliveryCoordinates.latitude.toFixed(6)} · Longitude {deliveryCoordinates.longitude.toFixed(6)}</span>
                    <button type="button" onClick={handleClearCurrentLocation}>Clear location</button>
                  </div>
                ) : null}
              </div>

              <div className="delivery-options" aria-label="Delivery options">
                <label>
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="standard"
                    checked={checkoutForm.deliveryMethod === 'standard'}
                    onChange={handleInputChange}
                  />
                  <span>Standard delivery</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="express"
                    checked={checkoutForm.deliveryMethod === 'express'}
                    onChange={handleInputChange}
                  />
                  <span>Express delivery</span>
                </label>
              </div>

              <div className="payment-options">
                {paymentMethods.map((method) => (
                  <label key={method} className="payment-option">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method}
                      checked={checkoutForm.paymentMethod === method}
                      onChange={handleInputChange}
                    />
                    <span>{method}</span>
                  </label>
                ))}
              </div>
            </form>

            <aside className="checkout-summary">
              <h3>Order confirmation</h3>

              <div className="summary-block">
                <div className="summary-line">
                  <span>Items</span>
                  <strong>{cart.reduce((count, item) => count + item.quantity, 0)} products</strong>
                </div>
                <div className="summary-line">
                  <span>Delivery</span>
                  <strong>{delivery} MAD</strong>
                </div>
                <div className="summary-line">
                  <span>Estimated time</span>
                  <strong>25-30 min</strong>
                </div>
              </div>

              <div className="summary-total">
                <span>Total due</span>
                <strong>{total} MAD</strong>
              </div>

              {orderMessage ? <p className="order-status">{orderMessage}</p> : null}
              <button className="primary-button large full-width" type="button" onClick={handleCheckout}>
                Confirm order
              </button>
            </aside>
          </div>
        </section>

        <section id="account" className="account-section" aria-label="Customer account area">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Account</span>
              <h2>{customerAccount.title}</h2>
            </div>
          </div>

          <div className="account-box">
            <div className="account-panel account-visual">
              <div className="account-emoji">👤</div>
              <h3>{customerAccount.title}</h3>
              <p>{customerAccount.subtitle}</p>
            </div>

            <div className="account-panel account-form-panel">
              <div className="auth-switch">
                <button
                  type="button"
                  className={authMode === 'login' ? 'active' : ''}
                  onClick={() => setAuthMode('login')}
                >
                  Login
                </button>
                <button
                  type="button"
                  className={authMode === 'register' ? 'active' : ''}
                  onClick={() => setAuthMode('register')}
                >
                  Register
                </button>
              </div>

              {authMode === 'register' ? (
                <>
                  <div className="input-group">
                    <label htmlFor="registerName">Full name</label>
                    <input
                      id="registerName"
                      name="name"
                      type="text"
                      value={registerForm.name}
                      onChange={handleRegisterInputChange}
                      placeholder="Your name"
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="registerEmail">Email</label>
                    <input
                      id="registerEmail"
                      name="email"
                      type="email"
                      value={registerForm.email}
                      onChange={handleRegisterInputChange}
                      placeholder="you@example.com"
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="registerPassword">Password</label>
                    <input
                      id="registerPassword"
                      name="password"
                      type="password"
                      value={registerForm.password}
                      onChange={handleRegisterInputChange}
                      placeholder="Create a password"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="input-group">
                    <label htmlFor="email">Email</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={authForm.email}
                      onChange={handleAuthInputChange}
                      placeholder="you@example.com"
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="password">Password</label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      value={authForm.password}
                      onChange={handleAuthInputChange}
                      placeholder="••••••••"
                    />
                  </div>
                </>
              )}

              <div className="remember-row">
                <label>
                  <input type="checkbox" defaultChecked />
                  <span>Remember me</span>
                </label>
              </div>

              {authMessage ? <p className="order-status">{authMessage}</p> : null}

              <button className="primary-button large full-width" type="button" onClick={handleAuthSubmit}>
                {authUser ? `Continue as ${authUser.name}` : authMode === 'register' ? 'Create account' : 'Continue'}
              </button>

              {authUser ? (
                <div className="account-summary">
                  <div className="account-summary-header">
                    <h4>Recent orders</h4>
                    <span>{authUser.role === 'admin' ? 'Admin view' : 'Customer view'}</span>
                  </div>

                  {customerOrderHistory.length > 0 ? (
                    <ul className="order-history-list">
                      {customerOrderHistory.map((order) => (
                        <li key={order.id}>
                          <div>
                            <strong>{order.id}</strong>
                            <span>{order.status}</span>
                          </div>
                          <em>{order.total}</em>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-order-note">No orders yet. Your first purchase will appear here.</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {isAdmin ? (
          <section className="admin-section" aria-label="Admin dashboard">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Admin</span>
              <h2>Dashboard overview</h2>
            </div>
            <button className="primary-button" type="button" onClick={handleExportReport}>Export report</button>
          </div>

          <div className="admin-metrics">
            {adminMetrics.map((metric) => (
              <article key={metric.label} className="metric-card">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>

          <div className="admin-grid">
            <div className="panel admin-orders">
              <div className="panel-header">
                <h3>Orders</h3>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {adminRecentOrders.length === 0 ? (
                    <tr><td colSpan="4">No orders yet.</td></tr>
                  ) : adminRecentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
                      <td>{order.customer}</td>
                      <td>
                        <select
                          className="status-select"
                          value={order.status}
                          onChange={(event) => handleStatusChange(Number(order.id.replace('#', '')), event.target.value)}
                        >
                          <option value="pending">Pending</option>
                          <option value="packed">Packed</option>
                          <option value="delivering">Delivering</option>
                          <option value="completed">Completed</option>
                        </select>
                      </td>
                      <td>{order.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel admin-inventory">
              <div className="panel-header">
                <h3>Inventory</h3>
                <a href="#product-management">Manage</a>
              </div>

              <ul>
                {inventoryRows.length === 0 ? (
                  <li><div><strong>No low-stock products</strong></div></li>
                ) : inventoryRows.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.stock}</span>
                    </div>
                    <em>{item.status}</em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          </section>
        ) : null}

        {isAdmin ? (
          <section className="management-section" id="product-management" aria-label="Product management panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Inventory</span>
              <h2>Product management</h2>
            </div>
            <button className="primary-button" type="button" onClick={handleAddProduct}>Add product</button>
          </div>

          <div className="management-banner" aria-label="Inventory summary">
            <div className="management-stat">
              <span>Active products</span>
              <strong>{activeProducts.length}</strong>
            </div>
            <div className="management-stat">
              <span>Low stock</span>
              <strong>{activeProducts.filter((product) => product.stock <= 20).length}</strong>
            </div>
            <div className="management-stat">
              <span>Archived</span>
              <strong>{products.filter((product) => product.isActive === false).length}</strong>
            </div>
          </div>

          {productEditorOpen ? (
            <form className="product-editor panel" onSubmit={handleSaveProduct}>
              <div className="panel-header">
                <h3>{editingProductId === null ? 'Add product' : 'Edit product'}</h3>
                <button type="button" className="ghost-button small" onClick={() => setProductEditorOpen(false)}>Cancel</button>
              </div>
              <div className="product-editor-grid">
                <label className="input-group">
                  <span>Product name</span>
                  <input name="name" required maxLength="120" value={productDraft.name} onChange={handleProductDraftChange} />
                </label>
                <label className="input-group">
                  <span>Category</span>
                  <input name="category" required maxLength="80" value={productDraft.category} onChange={handleProductDraftChange} />
                </label>
                <label className="input-group">
                  <span>Price (MAD)</span>
                  <input name="price" type="number" min="0.01" max="1000000" step="0.01" required value={productDraft.price} onChange={handleProductDraftChange} />
                </label>
                <label className="input-group">
                  <span>Stock units</span>
                  <input name="stock" type="number" min="0" max="1000000" step="1" required value={productDraft.stock} onChange={handleProductDraftChange} />
                </label>
                <label className="input-group">
                  <span>Badge</span>
                  <input name="badge" required maxLength="40" value={productDraft.badge} onChange={handleProductDraftChange} />
                </label>
                <label className="input-group product-description-field">
                  <span>Description</span>
                  <textarea name="description" required maxLength="500" rows="3" value={productDraft.description} onChange={handleProductDraftChange} />
                </label>
              </div>
              {productFormError ? <p className="order-status" role="alert">{productFormError}</p> : null}
              <button className="primary-button" type="submit">Save product</button>
            </form>
          ) : null}

          <div className="management-table-wrap panel">
            <table className="product-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {managedProducts.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.category}</td>
                    <td>{product.price}</td>
                    <td>{product.stock}</td>
                    <td>
                      <span className={`state-pill ${product.status === 'Archived' ? 'archived' : product.status === 'Low stock' ? 'low-stock' : 'in-stock'}`}>
                        {product.status}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button type="button" onClick={() => handleEditProduct(product.id)}>Edit</button>
                        {product.isActive ? (
                          <button type="button" className="danger-action" onClick={() => handleArchiveProduct(product.id)}>Archive</button>
                        ) : (
                          <button type="button" onClick={() => handleProductAvailabilityChange(product.id, true)}>Restore</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </section>
        ) : null}

        <section className="benefits-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Why us</span>
              <h2>Built for a better shopping experience</h2>
            </div>
          </div>

          <div className="benefits-grid">
            <article>
              <span>🚚</span>
              <h3>Fast delivery</h3>
              <p>Reliable delivery options across Agadir and nearby zones.</p>
            </article>
            <article>
              <span>🥬</span>
              <h3>Fresh quality</h3>
              <p>Carefully selected products with daily stock rotation.</p>
            </article>
            <article>
              <span>💳</span>
              <h3>Secure checkout</h3>
              <p>Protected order flow with simple and efficient payment steps.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="site-footer" id="contact">
        <div className="container footer-inner">
          <div>
            <p className="brand-name">SuperMarket eNahda</p>
            <p>Fresh groceries, trusted service, modern convenience.</p>
          </div>
          <div>
            <h4>Hours</h4>
            <p>Mon - Sun</p>
            <p>09:00 — 23:00</p>
          </div>
          <div>
            <h4>Location</h4>
            <p>Agadir, Morocco</p>
            <p>hello@enahda.store</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
