// Auth utilities
const checkAuth = () => {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
};

const getEnterpriseDetails = () => {
    const details = localStorage.getItem('enterpriseDetails');
    return details ? JSON.parse(details) : null;
};

const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('enterpriseDetails');
    window.location.href = '/login.html';
};

// Add enterprise details to bills
const addEnterpriseDetailsToBill = () => {
    const enterprise = getEnterpriseDetails();
    if (!enterprise) return;

    const enterpriseDetailsSection = document.createElement('div');
    enterpriseDetailsSection.className = 'mb-6 border-b pb-4';
    enterpriseDetailsSection.innerHTML = `
        <div class="text-center mb-4">
            <h2 class="text-xl font-bold text-gray-800">${enterprise.enterprise_name}</h2>
            <p class="text-sm text-gray-600">${enterprise.address}</p>
            <p class="text-sm text-gray-600">Phone: ${enterprise.phone_number}</p>
            ${enterprise.email ? `<p class="text-sm text-gray-600">Email: ${enterprise.email}</p>` : ''}
            ${enterprise.gst_number ? `<p class="text-sm text-gray-600">GST: ${enterprise.gst_number}</p>` : ''}
        </div>
    `;

    // Insert enterprise details at the top of the billing section
    const billingSection = document.getElementById('billing-section');
    const firstChild = billingSection.firstChild;
    billingSection.insertBefore(enterpriseDetailsSection, firstChild);
};

// Update user info in header
const updateUserInfo = () => {
    const enterprise = getEnterpriseDetails();
    if (!enterprise) return;

    const userInfoDiv = document.createElement('div');
    userInfoDiv.className = 'ml-4 flex items-center';
    userInfoDiv.innerHTML = `
        <div class="text-sm mr-4">
            <p class="text-gray-900 font-medium">${enterprise.owner_name}</p>
            <p class="text-gray-500">${enterprise.enterprise_name}</p>
        </div>
        <button onclick="logout()" 
                class="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
            <i class="fas fa-sign-out-alt mr-2"></i> Logout
        </button>
    `;

    // Add user info to navigation
    const nav = document.querySelector('nav .flex.justify-between');
    nav.appendChild(userInfoDiv);
};

// Initialize auth
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    // Add enterprise details to bills
    addEnterpriseDetailsToBill();
    
    // Update user info in header
    updateUserInfo();
});