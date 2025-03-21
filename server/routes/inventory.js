const express = require('express');
const router = express.Router();
const { db, runQuery, getOne, getAll } = require('../database');

// Generate unique item code
const generateItemCode = async () => {
    const result = await getOne('SELECT MAX(id) as maxId FROM inventory');
    const nextId = (result?.maxId || 0) + 1;
    return `INV${String(nextId).padStart(4, '0')}`;
};

// Get all inventory items
router.get('/', async (req, res, next) => {
    try {
        const inventory = await getAll('SELECT * FROM inventory ORDER BY item_name ASC');
        res.json({
            success: true,
            data: inventory
        });
    } catch (err) {
        next(err);
    }
});

// Get single inventory item
router.get('/:id', async (req, res, next) => {
    try {
        const item = await getOne('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
        
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        res.json({
            success: true,
            data: item
        });
    } catch (err) {
        next(err);
    }
});

// Create new inventory item
router.post('/', async (req, res, next) => {
    try {
        const { item_name, description, price, quantity } = req.body;

        // Validate required fields
        if (!item_name || price === undefined || quantity === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Item name, price, and quantity are required'
            });
        }

        // Generate unique item code
        const item_code = await generateItemCode();

        // Create new inventory item
        const result = await runQuery(
            'INSERT INTO inventory (item_code, item_name, description, price, quantity) VALUES (?, ?, ?, ?, ?)',
            [item_code, item_name, description || '', price, quantity]
        );

        const newItem = await getOne('SELECT * FROM inventory WHERE id = ?', [result.lastID]);

        res.status(201).json({
            success: true,
            message: 'Inventory item created successfully',
            data: newItem
        });
    } catch (err) {
        next(err);
    }
});

// Update inventory item
router.put('/:id', async (req, res, next) => {
    try {
        const { item_name, description, price, quantity } = req.body;
        const { id } = req.params;

        // Validate required fields
        if (!item_name || price === undefined || quantity === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Item name, price, and quantity are required'
            });
        }

        // Check if item exists
        const item = await getOne('SELECT * FROM inventory WHERE id = ?', [id]);
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        // Update inventory item
        await runQuery(
            'UPDATE inventory SET item_name = ?, description = ?, price = ?, quantity = ? WHERE id = ?',
            [item_name, description || '', price, quantity, id]
        );

        const updatedItem = await getOne('SELECT * FROM inventory WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Inventory item updated successfully',
            data: updatedItem
        });
    } catch (err) {
        next(err);
    }
});

// Update inventory quantity
router.patch('/:id/quantity', async (req, res, next) => {
    try {
        const { quantity } = req.body;
        const { id } = req.params;

        if (quantity === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Quantity is required'
            });
        }

        // Check if item exists and get current quantity
        const item = await getOne('SELECT * FROM inventory WHERE id = ?', [id]);
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        // Update quantity
        await runQuery(
            'UPDATE inventory SET quantity = ? WHERE id = ?',
            [quantity, id]
        );

        const updatedItem = await getOne('SELECT * FROM inventory WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Inventory quantity updated successfully',
            data: updatedItem
        });
    } catch (err) {
        next(err);
    }
});

// Delete inventory item
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check if item exists
        const item = await getOne('SELECT * FROM inventory WHERE id = ?', [id]);
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        // Delete item
        await runQuery('DELETE FROM inventory WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Inventory item deleted successfully'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;