// API endpoints
const API_BASE_URL = 'http://localhost:3000/api';
const ENDPOINTS = {
    LOGIN: `${API_BASE_URL}/auth/login`,
    REGISTER: `${API_BASE_URL}/auth/register`,
    VERIFY_OTP: `${API_BASE_URL}/auth/verify-otp`,
    RESEND_OTP: `${API_BASE_URL}/auth/resend-otp`
};

// State management
let isLoginMode = false;
let isOtpSent = false;
let currentPhone = '';

// Utility functions
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

// Form validation
const validateForm = (formData) => {
    const errors = [];

    if (isLoginMode) {
        if (!formData.get('phone_number')) errors.push('Phone number is required');
        if (!formData.get('password')) errors.push('Password is required');
    } else {
        if (!formData.get('enterprise_name')) errors.push('Enterprise name is required');
        if (!formData.get('owner_name')) errors.push('Owner name is required');
        if (!formData.get('phone_number')) errors.push('Phone number is required');
        if (!formData.get('address')) errors.push('Business address is required');
        if (!formData.get('password')) errors.push('Password is required');
        if (formData.get('password') !== formData.get('confirm_password')) {
            errors.push('Passwords do not match');
        }
        if (formData.get('password').length < 8) {
            errors.push('Password must be at least 8 characters long');
        }
    }

    // Validate phone number format
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(formData.get('phone_number'))) {
        errors.push('Please enter a valid 10-digit phone number');
    }

    // Validate email format if provided
    const email = formData.get('email');
    if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errors.push('Please enter a valid email address');
        }
    }

    return errors;
};

// Toggle between login and register forms
const toggleAuthMode = () => {
    isLoginMode = !isLoginMode;
    const form = document.getElementById('auth-form');
    const submitBtn = document.getElementById('auth-submit');
    const toggleLink = document.getElementById('toggle-auth');
    const title = document.querySelector('h1 + p');

    // Toggle form fields visibility
    const registerOnlyFields = [
        'enterprise-name',
        'owner-name',
        'email',
        'address',
        'gst-number',
        'confirm-password'
    ];

    registerOnlyFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.closest('div').style.display = isLoginMode ? 'none' : 'block';
        }
    });

    // Update text content
    submitBtn.textContent = isLoginMode ? 'Login' : 'Register Enterprise';
    toggleLink.textContent = isLoginMode ? 'Register here' : 'Login here';
    title.textContent = isLoginMode ? 'Login to your Account' : 'Register your Enterprise';

    // Clear form and any error messages
    form.reset();
};

// Handle form submission
const handleSubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    // Validate form
    const errors = validateForm(formData);
    if (errors.length > 0) {
        showToast(errors[0], false);
        return;
    }

    try {
        const endpoint = isLoginMode ? ENDPOINTS.LOGIN : ENDPOINTS.REGISTER;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(Object.fromEntries(formData))
        });

        const data = await response.json();
        
        if (data.success) {
            if (data.requiresOTP) {
                isOtpSent = true;
                currentPhone = formData.get('phone_number');
                showOTPVerification();
                showToast('OTP sent to your phone number');
            } else {
                // Store auth token and enterprise details
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('enterpriseDetails', JSON.stringify(data.enterprise));
                
                // Redirect to main application
                window.location.href = '/index.html';
            }
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showToast(error.message, false);
    }
};

// Show OTP verification form
const showOTPVerification = () => {
    const form = document.getElementById('auth-form');
    const originalContent = form.innerHTML;

    // Store original content for going back
    form.dataset.originalContent = originalContent;

    form.innerHTML = `
        <div class="space-y-6">
            <div class="text-center">
                <h2 class="text-xl font-semibold text-gray-900">Verify Your Phone Number</h2>
                <p class="mt-2 text-sm text-gray-600">
                    We've sent a verification code to ${currentPhone}
                </p>
            </div>
            <div>
                <label for="otp" class="block text-sm font-medium text-gray-700">Enter OTP</label>
                <input type="text" id="otp" name="otp" required
                       class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                       placeholder="Enter 6-digit OTP">
            </div>
            <div>
                <button type="button" onclick="verifyOTP()"
                        class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                    Verify OTP
                </button>
            </div>
            <div class="text-center text-sm">
                <p class="text-gray-600">
                    Didn't receive the code? 
                    <a href="#" onclick="resendOTP()" class="font-medium text-indigo-600 hover:text-indigo-500">
                        Resend OTP
                    </a>
                </p>
            </div>
        </div>
    `;
};

// Verify OTP
const verifyOTP = async () => {
    const otp = document.getElementById('otp').value;
    
    if (!otp || otp.length !== 6) {
        showToast('Please enter a valid 6-digit OTP', false);
        return;
    }

    try {
        const response = await fetch(ENDPOINTS.VERIFY_OTP, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone_number: currentPhone,
                otp: otp
            })
        });

        const data = await response.json();
        
        if (data.success) {
            // Store auth token and enterprise details
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('enterpriseDetails', JSON.stringify(data.enterprise));
            
            showToast('Phone number verified successfully');
            
            // Redirect to main application
            setTimeout(() => {
                window.location.href = '/index.html';
            }, 1000);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showToast(error.message, false);
    }
};

// Resend OTP
const resendOTP = async () => {
    try {
        const response = await fetch(ENDPOINTS.RESEND_OTP, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone_number: currentPhone
            })
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('OTP resent successfully');
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showToast(error.message, false);
    }
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('auth-form');
    const toggleLink = document.getElementById('toggle-auth');

    form.addEventListener('submit', handleSubmit);
    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuthMode();
    });

    // Initialize form state
    toggleAuthMode();
});

// Check if user is already logged in
const checkAuthStatus = () => {
    const authToken = localStorage.getItem('authToken');
    if (authToken) {
        window.location.href = '/index.html';
    }
};

// Initialize
checkAuthStatus();