const express = require('express');
const router = express.Router();
const { db, runQuery, getOne, getAll } = require('../database');

// Get all customers
router.get('/', async (req, res, next) => {
    try {
        const customers = await getAll('SELECT * FROM customers ORDER BY created_at DESC');
        res.json({
            success: true,
            data: customers
        });
    } catch (err) {
        next(err);
    }
});

// Get customer by phone number
router.get('/phone/:phoneNumber', async (req, res, next) => {
    try {
        const customer = await getOne(
            'SELECT * FROM customers WHERE phone_number = ?',
            [req.params.phoneNumber]
        );
        
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        res.json({
            success: true,
            data: customer
        });
    } catch (err) {
        next(err);
    }
});

// Create new customer
router.post('/', async (req, res, next) => {
    try {
        const { name, phone_number } = req.body;

        // Validate required fields
        if (!name || !phone_number) {
            return res.status(400).json({
                success: false,
                message: 'Name and phone number are required'
            });
        }

        // Check if customer already exists
        const existingCustomer = await getOne(
            'SELECT * FROM customers WHERE phone_number = ?',
            [phone_number]
        );

        if (existingCustomer) {
            return res.json({
                success: true,
                message: 'Customer already exists',
                data: existingCustomer
            });
        }

        // Create new customer
        const result = await runQuery(
            'INSERT INTO customers (name, phone_number) VALUES (?, ?)',
            [name, phone_number]
        );

        const newCustomer = await getOne(
            'SELECT * FROM customers WHERE id = ?',
            [result.lastID]
        );

        res.status(201).json({
            success: true,
            message: 'Customer created successfully',
            data: newCustomer
        });
    } catch (err) {
        next(err);
    }
});

// Update customer
router.put('/:id', async (req, res, next) => {
    try {
        const { name, phone_number } = req.body;
        const { id } = req.params;

        // Validate required fields
        if (!name || !phone_number) {
            return res.status(400).json({
                success: false,
                message: 'Name and phone number are required'
            });
        }

        // Check if customer exists
        const customer = await getOne('SELECT * FROM customers WHERE id = ?', [id]);
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        // Update customer
        await runQuery(
            'UPDATE customers SET name = ?, phone_number = ? WHERE id = ?',
            [name, phone_number, id]
        );

        const updatedCustomer = await getOne('SELECT * FROM customers WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Customer updated successfully',
            data: updatedCustomer
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;