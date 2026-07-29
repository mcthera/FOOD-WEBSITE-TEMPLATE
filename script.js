// ==========================================
// FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyA-sPfX1Wjgbuk3Eq5qWttPq_zOiooE1PI",
  authDomain: "catering-service-8d6dc.firebaseapp.com",
  projectId: "catering-service-8d6dc",
  storageBucket: "catering-service-8d6dc.firebasestorage.app",
  messagingSenderId: "546398526606",
  appId: "1:546398526606:web:c5cf282b6e304849143ddf"
};

// Initialize Firebase safely
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// Default Menu Data (used to seed Firestore if collection is empty)
const defaultMenu = [
    { id: 1, name: "Signature Jollof Rice & Grilled Chicken", category: "Rice", price: 55, image: "FD.jpeg" },
    { id: 2, name: "Fried Rice with Chicken Drumsticks", category: "Rice", price: 50, image: "FD.jpeg" },
    { id: 3, name: "Fried Plantain & Assorted Stew", category: "Local", price: 45, image: "FD.jpeg" },
    { id: 4, name: "Waakye Special Package", category: "Local", price: 50, image: "FD.jpeg" },
    { id: 5, name: "Affordable Daily Lunch Pack", category: "Packages", price: 35, image: "FD.jpeg" }
];

// Helper: Cart stays in session storage for seamless user UX across pages
function getCart() { return JSON.parse(sessionStorage.getItem('cart')) || []; }
function saveCart(cart) { sessionStorage.setItem('cart', JSON.stringify(cart)); }

// DOM Loaded Event Handler
document.addEventListener('DOMContentLoaded', async () => {
    updateCartCount();
    await initializeFirestoreData();

    // Check for Admin Authentication Modal
    if (document.getElementById('admin-login-modal') || document.getElementById('login-form')) {
        setupAdminAuth();
    }

    // Page Specific Renders for public pages
    if (document.getElementById('menu-grid')) {
        await renderMenu('all');
        setupFilters();
    }

    // Cart Drawer Interactions
    const cartBtn = document.getElementById('cart-btn');
    const closeCart = document.getElementById('close-cart');
    const cartDrawer = document.getElementById('cart-drawer');

    if (cartBtn) cartBtn.addEventListener('click', () => { cartDrawer.classList.add('open'); renderCartItems(); });
    if (closeCart) closeCart.addEventListener('click', () => { cartDrawer.classList.remove('open'); });

    // Checkout Button opens Customer Details Modal
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            const cart = getCart();
            if (cart.length === 0) {
                alert('Your cart is empty!');
                return;
            }
            if (cartDrawer) cartDrawer.classList.remove('open');
            const custModal = document.getElementById('checkout-modal');
            if (custModal) custModal.style.display = 'flex';
        });
    }

    // Close Customer Modal Button
    const closeCustModal = document.getElementById('close-cust-modal');
    if (closeCustModal) {
        closeCustModal.addEventListener('click', () => {
            const custModal = document.getElementById('checkout-modal');
            if (custModal) custModal.style.display = 'none';
        });
    }

    // Customer Form Submission & WhatsApp Redirect Trigger
    const custForm = document.getElementById('customer-details-form');
    if (custForm) {
        custForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const customerName = document.getElementById('cust-name').value.trim();
            const customerPhone = document.getElementById('cust-phone').value.trim();

            const cart = getCart();
            let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
            let itemsSummary = cart.map(i => `${i.name} (${i.qty})`).join(', ');

            const randomOrdNum = Math.floor(1000 + Math.random() * 9000);
            const orderIdCode = `ORD-${randomOrdNum}`;

            const newOrder = {
                orderId: orderIdCode,
                customer: `${customerName} (${customerPhone})`,
                items: itemsSummary,
                total: total,
                status: "Pending",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            try {
                await db.collection('orders').add(newOrder);
                
                sessionStorage.removeItem('cart');
                updateCartCount();
                
                const custModal = document.getElementById('checkout-modal');
                if (custModal) custModal.style.display = 'none';
                custForm.reset();

                const businessPhone = "233541604633";
                const message = encodeURIComponent(`Hello Daytime Meals, my name is ${customerName} (${customerPhone}). I just placed an order on your website:\n\nOrder ID: ${orderIdCode}\nItems: ${itemsSummary}\nTotal: GH₵ ${total.toFixed(2)}\n\nPlease confirm delivery.`);
                window.location.href = `https://wa.me/${businessPhone}?text=${message}`;
            } catch (error) {
                console.error("Error submitting order: ", error);
                alert("There was an error processing your order. Please try again.");
            }
        });
    }
});

// Seed Firestore with default menu/orders if empty
async function initializeFirestoreData() {
    try {
        const menuSnapshot = await db.collection('menu').get();
        if (menuSnapshot.empty) {
            const batch = db.batch();
            defaultMenu.forEach(item => {
                const docRef = db.collection('menu').doc(item.id.toString());
                batch.set(docRef, item);
            });
            await batch.commit();
        }

        const ordersSnapshot = await db.collection('orders').get();
        if (ordersSnapshot.empty) {
            await db.collection('orders').add({
                orderId: "ORD-1001",
                customer: "Kwame Mensah (0240000000)",
                items: "Jollof Rice (1)",
                total: 55,
                status: "Delivered",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error("Error initializing Firebase data: ", error);
    }
}

// Admin Authentication Setup (Fixed element checking & duplication)
function setupAdminAuth() {
    const loginModal = document.getElementById('admin-login-modal');
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('admin-password');
    const loginError = document.getElementById('login-error');
    const sidebar = document.getElementById('admin-sidebar');
    const mainContent = document.getElementById('admin-main-content');
    const logoutBtn = document.getElementById('logout-btn');

    const ADMIN_PASSWORD = "CATERING";

    if (sessionStorage.getItem('isAdminAuthenticated') === 'true') {
        if (loginModal) loginModal.style.display = 'none';
        if (sidebar) sidebar.style.display = 'block';
        if (mainContent) mainContent.style.display = 'block';
        initRealtimeAdminDashboard();
        setupAdminTabs();
        setupAddMenuForm();
        return;
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const enteredPassword = passwordInput ? passwordInput.value.trim() : "";
            if (enteredPassword === ADMIN_PASSWORD) {
                sessionStorage.setItem('isAdminAuthenticated', 'true');
                if (loginModal) loginModal.style.display = 'none';
                if (sidebar) sidebar.style.display = 'block';
                if (mainContent) mainContent.style.display = 'block';
                initRealtimeAdminDashboard();
                setupAdminTabs();
                setupAddMenuForm();
            } else {
                if (loginError) loginError.style.display = 'block';
                if (passwordInput) passwordInput.value = '';
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.removeItem('isAdminAuthenticated');
            window.location.reload();
        });
    }
}

// Render Menu from Firestore
async function renderMenu(category) {
    const menuGrid = document.getElementById('menu-grid');
    if (!menuGrid) return;
    menuGrid.innerHTML = '<p>Loading menu...</p>';

    try {
        const snapshot = await db.collection('menu').get();
        menuGrid.innerHTML = '';
        
        let menuItems = [];
        snapshot.forEach(doc => menuItems.push({ docId: doc.id, ...doc.data() }));

        const filtered = category === 'all' ? menuItems : menuItems.filter(item => item.category === category);

        filtered.forEach(item => {
            const card = document.createElement('div');
            card.className = 'menu-card';
            card.innerHTML = `
                <img src="${item.image}" alt="${item.name}">
                <div class="menu-card-body">
                    <h3>${item.name}</h3>
                    <div class="menu-price">GH₵ ${item.price.toFixed(2)}</div>
                    <button onclick="addToCart('${item.docId}', '${item.name}', ${item.price})" class="btn btn-primary">Add to Cart</button>
                </div>
            `;
            menuGrid.appendChild(card);
        });
    } catch (error) {
        console.error("Error fetching menu:", error);
        menuGrid.innerHTML = '<p>Failed to load menu items.</p>';
    }
}

// Filter Buttons setup
function setupFilters() {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            buttons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderMenu(e.target.getAttribute('data-filter'));
        });
    });
}

// Cart Logic
function addToCart(id, name, price) {
    let cart = getCart();
    const existing = cart.find(c => c.id === id);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ id, name, price, qty: 1 });
    }

    saveCart(cart);
    updateCartCount();
    alert(`${name} added to cart!`);
}

function updateCartCount() {
    const cart = getCart();
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const countEl = document.getElementById('cart-count');
    if (countEl) countEl.innerText = count;
}

function renderCartItems() {
    const cartItemsContainer = document.getElementById('cart-items');
    if (!cartItemsContainer) return;
    const cart = getCart();
    cartItemsContainer.innerHTML = '';

    let total = 0;

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p>Your cart is empty.</p>';
        document.getElementById('cart-total-price').innerText = 'GH₵ 0.00';
        return;
    }

    cart.forEach(item => {
        total += item.price * item.qty;
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div>
                <h4>${item.name}</h4>
                <small>GH₵ ${item.price} x ${item.qty}</small>
            </div>
            <button onclick="removeFromCart('${item.id}')" style="background:none; border:none; color:red; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        `;
        cartItemsContainer.appendChild(div);
    });

    document.getElementById('cart-total-price').innerText = `GH₵ ${total.toFixed(2)}`;
}

function removeFromCart(id) {
    let cart = getCart();
    cart = cart.filter(item => item.id !== id);
    saveCart(cart);
    updateCartCount();
    renderCartItems();
}

// ==========================================
// REAL-TIME ADMIN DASHBOARD (LIVE LISTENERS)
// ==========================================
function initRealtimeAdminDashboard() {
    db.collection('orders').orderBy('createdAt', 'desc').onSnapshot(orderSnapshot => {
        let orders = [];
        orderSnapshot.forEach(doc => orders.push({ docId: doc.id, ...doc.data() }));

        const totalOrdersEl = document.getElementById('stat-total-orders');
        if (totalOrdersEl) totalOrdersEl.innerText = orders.length;

        let revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
        const totalRevEl = document.getElementById('stat-total-revenue');
        if (totalRevEl) totalRevEl.innerText = `GH₵ ${revenue.toFixed(2)}`;

        const ordersList = document.getElementById('admin-orders-list');
        if (ordersList) {
            ordersList.innerHTML = '';
            orders.forEach(o => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${o.orderId || o.docId}</td>
                    <td>${o.customer}</td>
                    <td>${o.items}</td>
                    <td>GH₵ ${(o.total || 0).toFixed(2)}</td>
                    <td>
                        <select onchange="updateOrderStatus('${o.docId}', this.value)" style="padding: 6px; border-radius: 4px; font-weight: bold; cursor: pointer; color: ${o.status === 'Delivered' ? 'green' : 'orange'};">
                            <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
                            <option value="Out for Delivery" ${o.status === 'Out for Delivery' ? 'selected' : ''}>Out for Delivery</option>
                            <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                        </select>
                    </td>
                    <td>
                        <button onclick="deleteOrder('${o.docId}')" class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.8rem; background-color: #fff1f1; color: red; border-color: #ffcccc; cursor: pointer;">
                            <i class="fa-solid fa-trash"></i> Delete
                        </button>
                    </td>
                `;
                ordersList.appendChild(tr);
            });
        }
    });

    db.collection('menu').onSnapshot(menuSnapshot => {
        let menu = [];
        menuSnapshot.forEach(doc => menu.push({ docId: doc.id, ...doc.data() }));

        const totalMenuEl = document.getElementById('stat-total-menu');
        if (totalMenuEl) totalMenuEl.innerText = menu.length;

        const adminMenuList = document.getElementById('admin-menu-list');
        if (adminMenuList) {
            adminMenuList.innerHTML = '';
            menu.forEach(m => {
                const div = document.createElement('div');
                div.className = 'menu-card';
                div.innerHTML = `
                    <img src="${m.image}" alt="${m.name}" style="height:120px; object-fit: cover;">
                    <div class="menu-card-body">
                        <h4>${m.name}</h4>
                        <p>GH₵ ${m.price}</p>
                        <button onclick="deleteMenuItem('${m.docId}')" class="btn btn-secondary" style="margin-top: 10px; padding: 5px 10px; font-size: 0.85rem;">Delete</button>
                    </div>
                `;
                adminMenuList.appendChild(div);
            });
        }
    });
}

async function updateOrderStatus(docId, newStatus) {
    try {
        await db.collection('orders').doc(docId).update({ status: newStatus });
    } catch (error) {
        console.error("Error updating order status: ", error);
        alert("Failed to update status.");
    }
}

async function deleteOrder(docId) {
    if (confirm('Are you sure you want to delete this order record?')) {
        try {
            await db.collection('orders').doc(docId).delete();
        } catch (error) {
            console.error("Error deleting order: ", error);
            alert("Failed to delete order.");
        }
    }
}

function setupAdminTabs() {
    const links = document.querySelectorAll('.sidebar .tab-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            const target = link.getAttribute('data-target');
            const targetEl = document.getElementById(target);
            if (targetEl) targetEl.classList.add('active');
        });
    });
}

function setupAddMenuForm() {
    const form = document.getElementById('add-menu-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-name').value;
        const category = document.getElementById('new-category').value;
        const price = parseFloat(document.getElementById('new-price').value);
        const image = document.getElementById('new-image').value;

        const newItem = {
            id: Date.now(),
            name,
            category,
            price,
            image
        };

        try {
            await db.collection('menu').add(newItem);
            alert('Menu item added successfully!');
            form.reset();
        } catch (error) {
            console.error("Error adding menu item: ", error);
            alert("Failed to add menu item.");
        }
    });
}

async function deleteMenuItem(docId) {
    if (confirm('Are you sure you want to delete this menu item?')) {
        try {
            await db.collection('menu').doc(docId).delete();
        } catch (error) {
            console.error("Error deleting menu item: ", error);
            alert("Failed to delete item.");
        }
    }
}