const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const billsRoutes = require('./routes/bills');
const inventoryRoutes = require('./routes/inventory');
const customersRoutes = require('./routes/customers');

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));
app.use(cors({
    origin: '*',  
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.error("🔴 No token received");
        return res.status(401).json({ success: false, message: 'Authentication token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            console.error("🔴 Invalid token:", err.message);
            return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        }

        console.log("🟢 Token verified for user:", user);
        req.user = user;
        next();
    });
};

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bills', authenticateToken, billsRoutes);
app.use('/api/inventory', authenticateToken, inventoryRoutes);
app.use('/api/customers', authenticateToken, customersRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Handle SPA routing
app.get('/api', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});