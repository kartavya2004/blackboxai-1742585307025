// Global state
let inventoryItems = [];
let billItems = [];

// API endpoints
const API_BASE_URL = 'http://localhost:3000/api';
const ENDPOINTS = {
    BILLS: `${API_BASE_URL}/bills`,
    CUSTOMERS: `${API_BASE_URL}/customers`,
    INVENTORY: `${API_BASE_URL}/inventory`
};

// Constants
const TAX_RATE = 0.09; // 9% for both CGST and SGST

// Utility functions
const formatCurrency = (amount) => {
    return `₹${parseFloat(amount).toFixed(2)}`;
};

const showToast = (message, isSuccess = true) => {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');

    toastMessage.textContent = message;
    toastIcon.className = isSuccess ? 'fas fa-check-circle text-green-500 text-xl' : 'fas fa-times-circle text-red-500 text-xl';
    
    toast.classList.add('toast-show');
    toast.classList.remove('toast-hide', 'translate-y-full');

    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
    }, 3000);
};

// Navigation functions
const showSection = (sectionName) => {
    // Hide all sections first
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
        section.classList.remove('active');
    });

    // Remove active state from all nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('border-indigo-500', 'text-gray-900');
        link.classList.add('border-transparent', 'text-gray-500');
    });
    
    // Show the selected section
    const section = document.getElementById(`${sectionName}-section`);
    section.classList.remove('hidden');
    section.classList.add('active');
    
    // Update the nav link
    const navLink = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
    if (navLink) {
        navLink.classList.remove('border-transparent', 'text-gray-500');
        navLink.classList.add('border-indigo-500', 'text-gray-900');
    }
};

// Modal functions
const showModal = (modalId) => {
    console.log('Showing modal:', modalId);
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error('Modal not found:', modalId);
        return;
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('show');
    document.body.classList.add('modal-open');
    console.log('Modal classes after show:', modal.className);
};

const closeModal = (modalId) => {
    console.log('Closing modal:', modalId);
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error('Modal not found:', modalId);
        return;
    }
    
    modal.classList.remove('show');
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    console.log('Modal classes after hide:', modal.className);
};
const refreshAuthToken = async () => {
    const authToken = localStorage.getItem('authToken');

    if (!authToken) return null;

    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/auth/refresh-token`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('authToken', data.token);
            return data.token;
        } else {
            throw new Error('Token refresh failed');
        }
    } catch (error) {
        console.error("🔴 Token refresh error:", error);
        localStorage.removeItem('authToken'); // Remove expired token
        return null;
    }
};

// ✅ Add `fetchWithAuth()` here in `app.js`
const fetchWithAuth = async (url, options = {}) => {
    let authToken = localStorage.getItem('authToken');

    if (!authToken) {
        showToast('Session expired. Please log in again.', false);
        return null;
    }

    // Add Authorization header
    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${authToken}`
    };

    let response = await fetch(url, options);

    if (response.status === 403) { // If token is expired
        console.warn("🔴 Token expired. Attempting to refresh...");
        authToken = await refreshAuthToken();

        if (!authToken) {
            showToast('Session expired. Please log in again.', false);
            return null;
        }

        // Retry the request with new token
        options.headers['Authorization'] = `Bearer ${authToken}`;
        response = await fetch(url, options);
    }

    return response.json();
};

// Inventory Management
const loadInventory = async () => {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        showToast('Please log in to access inventory', false);
        return;
    }

    try {
        const response = await fetchWithAuth(ENDPOINTS.INVENTORY, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        console.log("Inventory Response:", data); // Debugging

        if (data.success && Array.isArray(data.data)) {
            inventoryItems = data.data;
            renderInventoryTable();  // ✅ FIXED: Ensures UI Updates
        } else {
            showToast("No inventory items found", false);
        }
    } catch (error) {
        showToast(`Failed to load inventory: ${error.message}`, false);
    }
};

const renderInventoryTable = () => {
    const tbody = document.getElementById('inventory-items');
    if (!tbody) return; // Exit if we're not on the inventory page

    tbody.innerHTML = '';

    inventoryItems.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${item.item_code}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.item_name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.description || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(item.price)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm ${getStockColorClass(item.quantity)}">
                ${item.quantity}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <button onclick="editInventoryItem(${item.id})" class="text-indigo-600 hover:text-indigo-900 mr-3">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteInventoryItem(${item.id})" class="text-red-600 hover:text-red-900">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

const getStockColorClass = (quantity) => {
    if (quantity <= 5) return 'text-red-600';
    if (quantity <= 10) return 'text-yellow-600';
    return 'text-green-600';
};

const showAddInventoryModal = () => {
    const modal = document.getElementById('add-inventory-modal');
    if (modal) {
        modal.classList.add('show'); // ✅ Ensure the modal is visible
        modal.classList.remove('hidden');
        document.getElementById('add-inventory-form').reset(); // Reset form on open
    } else {
        console.error("Modal not found: add-inventory-modal");
    }
};
const closeAddInventoryModal = () => {
    const modal = document.getElementById('add-inventory-modal');
    if (modal) {
        modal.classList.remove('show'); // Hide the modal
        modal.classList.add('hidden');
    }
};

const saveInventoryItem = async (event) => {
    event.preventDefault();
    
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        showToast('Please log in to add inventory items', false);
        return;
    }

    const form = document.getElementById('add-inventory-form');
    if (!form.checkValidity()) {
        showToast('Please fill all required fields correctly', false);
        return;
    }

    const formData = new FormData(form);
    const data = {
        item_name: formData.get('item_name'),
        description: formData.get('description'),
        price: parseFloat(formData.get('price')),
        quantity: parseInt(formData.get('quantity'))
    };

    try {
        const response = await fetchWithAuth(ENDPOINTS.INVENTORY, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,  // ✅ FIXED: Added Auth Token
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (result.success) {
            showToast('Inventory item added successfully');
            closeAddInventoryModal();
            await loadInventory();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        showToast(`Failed to add inventory item: ${error.message}`, false);
    }
};

// Billing Functions
const addManualItem = () => {
    const newRow = {
        id: Date.now(),
        item_name: '',
        quantity: 1,
        unit_price: 0,
        inventory_id: null
    };
    
    billItems.push(newRow);
    renderBillItems();
};

const showInventoryModal = () => {
    console.log('Opening inventory selection modal');
    showModal('inventory-modal');
    renderInventorySelection();
};

const closeInventoryModal = () => {
    console.log('Closing inventory selection modal');
    closeModal('inventory-modal');
};

const renderInventorySelection = () => {
    console.log('Rendering inventory selection list');
    const container = document.getElementById('inventory-selection-list');
    if (!container) {
        console.error('Inventory selection list container not found');
        return;
    }

    container.innerHTML = '';

    inventoryItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'flex items-center p-3 border-b border-gray-200';
        div.innerHTML = `
            <input type="checkbox" id="select-item-${item.id}" class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded">
            <label for="select-item-${item.id}" class="ml-3 flex-1">
                <div class="text-sm font-medium text-gray-700">${item.item_name}</div>
                <div class="text-sm text-gray-500">Price: ${formatCurrency(item.price)} | Stock: ${item.quantity}</div>
            </label>
            <input type="number" id="quantity-item-${item.id}" min="1" max="${item.quantity}" value="1" 
                   class="w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
        `;
        container.appendChild(div);
    });
    console.log('Inventory selection list rendered');
};

const addSelectedItems = () => {
    const selectedItems = inventoryItems.filter(item => {
        const checkbox = document.getElementById(`select-item-${item.id}`);
        return checkbox && checkbox.checked;
    });

    console.log("Selected Items:", selectedItems); // Debugging

    selectedItems.forEach(item => {
        const quantityInput = document.getElementById(`quantity-item-${item.id}`);
        const quantity = parseInt(quantityInput?.value || 1);
        console.log(`Item: ${item.item_name}, Quantity: ${quantity}`); // Debugging

        if (quantity > 0 && quantity <= item.quantity) {
            const existingItem = billItems.find(billItem => billItem.inventory_id === item.id);
            if (existingItem) {
                existingItem.quantity += quantity; // Update quantity if item already exists
            } else {
                billItems.push({
                    id: Date.now(),
                    inventory_id: item.id,
                    item_name: item.item_name,
                    quantity: quantity,
                    unit_price: item.price
                });
            }
        }
    });

    console.log("Bill Items After Addition:", billItems); // Debugging
    renderBillItems(); // Update the bill display
    closeInventoryModal(); // Close the modal after adding items
    updateBillSummary(); // Update the summary
};
const renderBillItems = () => {
    const tbody = document.getElementById('bill-items');
    if (!tbody) return; // Exit if we're not on the billing page

    tbody.innerHTML = '';

    billItems.forEach((item, index) => {
        const tr = document.createElement('tr');
        const total = item.quantity * item.unit_price;
        
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${item.inventory_id ? 
                    item.item_name :
                    `<input type="text" value="${item.item_name}" 
                            onchange="updateBillItem(${index}, 'item_name', this.value)"
                            class="border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">`
                }
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <input type="number" value="${item.quantity}" min="1" 
                       onchange="updateBillItem(${index}, 'quantity', this.value)"
                       class="w-20 border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${item.inventory_id ?
                    formatCurrency(item.unit_price) :
                    `<input type="number" value="${item.unit_price}" min="0" step="0.01"
                            onchange="updateBillItem(${index}, 'unit_price', this.value)"
                            class="w-24 border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">`
                }
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatCurrency(total)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <button onclick="removeBillItem(${index})" class="text-red-600 hover:text-red-900">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    updateBillSummary();
};

const updateBillItem = (index, field, value) => {
    billItems[index][field] = field === 'item_name' ? value : parseFloat(value);
    renderBillItems();
};

const removeBillItem = (index) => {
    billItems.splice(index, 1);
    renderBillItems();
};

const updateBillSummary = () => {
    const subTotal = billItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const discount = parseFloat(document.getElementById('discount-before-tax')?.value) || 0;
    const taxableAmount = Math.max(subTotal - discount, 0);
    const cgst = taxableAmount * TAX_RATE;
    const sgst = taxableAmount * TAX_RATE;
    const totalAmount = taxableAmount + cgst + sgst;

    // Update summary fields if they exist
    const elements = {
        'sub-total': subTotal,
        'discount-amount': discount,
        'taxable-amount': taxableAmount,
        'cgst-amount': cgst,
        'sgst-amount': sgst,
        'total-amount': totalAmount
    };

    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = formatCurrency(value);
        }
    });
};

const addDownloadButton = (billId) => {
    const billActions = document.getElementById('bill-actions');
    if (!billActions) {
        console.error("Error: 'bill-actions' element not found.");
        return;
    }

    const downloadBtn = document.createElement('button');
    downloadBtn.innerText = 'Download Invoice';
    downloadBtn.classList.add('btn', 'btn-primary', 'mt-2');
    downloadBtn.onclick = () => downloadBill(billId);

    billActions.appendChild(downloadBtn);
};

const downloadBill = (billId) => {
    const authToken = localStorage.getItem('authToken');  
    if (!authToken) {
        showToast('Please log in first', false);
        return;
    }

    console.log("Using Token:", authToken); // Debugging

    fetch(`${API_BASE_URL}/bills/download/${billId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${authToken}`,  // ✅ Ensure this is included
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to download invoice: ${response.statusText}`);
        }
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice_${billId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    })
    .catch(error => showToast(`Download failed: ${error.message}`, false));
};

const generateBill = async () => {
    const customerName = document.getElementById('customer-name').value;
    const customerPhone = document.getElementById('customer-phone').value;
    const paymentMethod = document.getElementById('payment-method').value;
    const discountBeforeTax = parseFloat(document.getElementById('discount-before-tax').value) || 0;

    if (!customerName || !customerPhone) {
        showToast('Please enter customer details', false);
        return;
    }

    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        showToast('Please log in to generate a bill', false);
        return;
    }

    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/bills`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                customer: {
                    name: customerName,
                    phone_number: customerPhone
                },
                items: billItems,
                discount_before_tax: discountBeforeTax,
                payment_method: paymentMethod
            })
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('Bill generated successfully!');
            showDownloadAndShareButtons(data.data.invoice_number, data.data.whatsappUrl);

            // Enable WhatsApp sharing
            const shareButton = document.getElementById('share-whatsapp');
            if (shareButton) {
                shareButton.style.display = 'inline-flex';
                shareButton.onclick = () => window.open(data.data.whatsappUrl, '_blank');
            }
            
            // Reset form
            resetBillForm();
            
            // Reload inventory to update quantities
            await loadInventory();
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showToast(`Failed to generate bill: ${error.message}`, false);
    }
};
const showDownloadAndShareButtons = (invoiceNumber, whatsappUrl) => {
    console.log("Invoice Number:", invoiceNumber);
    console.log("WhatsApp URL:", whatsappUrl);

    const downloadButton = document.getElementById('download-invoice');
    const whatsappButton = document.getElementById('share-whatsapp');

    if (downloadButton) {
        downloadButton.onclick = () => {
            if (invoiceNumber) {
                console.log("Downloading:", invoiceNumber);
                window.location.href = `${API_BASE_URL}/bills/download/${invoiceNumber}`;
            } else {
                showToast("No invoice available for download", false);
            }
        };
    }

    if (whatsappButton) {
        whatsappButton.onclick = () => {
            if (whatsappUrl) {
                console.log("Sharing on WhatsApp:", whatsappUrl);
                window.open(whatsappUrl, '_blank');
            } else {
                showToast("No WhatsApp link available", false);
            }
        };
    }
};

const resetBillForm = () => {
    const elements = {
        'customer-name': '',
        'customer-phone': '',
        'discount-before-tax': '0',
        'payment-method': 'Cash'
    };

    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    });

    billItems = [];
    renderBillItems();

    const shareButton = document.getElementById('share-whatsapp');
    if (shareButton) {
        shareButton.style.display = 'none';
    }
};

// Initialize application
window.onload = async () => {
    await loadInventory();
};