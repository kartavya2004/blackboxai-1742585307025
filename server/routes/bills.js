const express = require('express');
const router = express.Router();
const { db, runQuery, getOne, getAll } = require('../database');
const puppeteer = require('puppeteer');
const jwt = require('jsonwebtoken'); // Missing import
const fs = require('fs');
const path = require('path');

// Constants for tax rates
const CGST_RATE = 0.09; // 9%
const SGST_RATE = 0.09; // 9%

// Helper function to generate WhatsApp share text
const generateBillText = (bill, customer, items) => {
    let text = `*Bill from ERP System*\n\n`;
    text += `Date: ${new Date(bill.bill_date).toLocaleString()}\n`;
    text += `Bill No: ${bill.id}\n`;
    text += `Customer: ${customer.name}\n`;
    text += `Phone: ${customer.phone_number}\n\n`;
    
    text += `*Items:*\n`;
    items.forEach((item, index) => {
        text += `${index + 1}. ${item.item_name}\n`;
        text += `   Qty: ${item.quantity} × ₹${item.unit_price} = ₹${item.quantity * item.unit_price}\n`;
    });
    
    text += `\n*Bill Summary:*\n`;
    text += `Sub Total: ₹${bill.sub_total}\n`;
    if (bill.discount_before_tax > 0) {
        text += `Discount: ₹${bill.discount_before_tax}\n`;
    }
    text += `Taxable Amount: ₹${bill.taxable_amount}\n`;
    text += `CGST (9%): ₹${bill.cgst}\n`;
    text += `SGST (9%): ₹${bill.sgst}\n`;
    text += `Total Amount: ₹${bill.total_amount}\n\n`;
    text += `Payment Method: ${bill.payment_method}\n`;
    
    return encodeURIComponent(text);
};

const loadTemplate = async (bill, enterprise) => {
    try {
        let template = await fs.promises.readFile(path.join(__dirname, '../templates/invoice_template.html'), 'utf-8');

        template = template.replace('{{bill_id}}', bill.id)
            .replace('{{bill_date}}', new Date(bill.bill_date).toLocaleString())
            .replace('{{status}}', bill.status || 'Unpaid')
            .replace('{{customer_name}}', bill.customer_name)
            .replace('{{customer_address}}', bill.customer_address || 'N/A')
            .replace('{{customer_phone}}', bill.customer_phone)
            .replace('{{enterprise_name}}', enterprise.enterprise_name)
            .replace('{{enterprise_address}}', enterprise.address)
            .replace('{{total}}', bill.total_amount)
            .replace('{{items}}', JSON.parse(bill.items).map((item, index) => `
                <tr>
                    <th>${index + 1}</th>
                    <td>${item.item_name}</td>
                    <td>${item.quantity}</td>
                    <td>₹${item.unit_price}</td>
                    <td>₹${item.quantity * item.unit_price}</td>
                </tr>`).join('')
            );

        return template;
    } catch (error) {
        console.error("Error loading template:", error);
        return null;
    }
};

const verifyAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ success: false, message: "Authentication token required" });
    }

    const token = authHeader.split(' ')[1];  

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, message: "Invalid or expired token" });
        }
        req.user = decoded;
        next();
    });
};
// Generate and serve the PDF
router.get('/download/:id', verifyAuth, async (req, res) => {
    try {
        const bill = await getOne(`
            SELECT b.*, c.name AS customer_name, c.phone_number AS customer_phone, c.address AS customer_address
            FROM bills b
            JOIN customers c ON b.customer_id = c.id
            WHERE b.id = ?`, 
            [req.params.id]
        );

        if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });

        const enterprise = await getOne('SELECT * FROM enterprises WHERE id = ?', [bill.enterprise_id]);
        if (!enterprise) return res.status(404).json({ success: false, message: 'Enterprise not found' });

        const htmlContent = await loadTemplate(bill, enterprise);
        if (!htmlContent) return res.status(500).json({ success: false, message: 'Failed to load invoice template' });

        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBuffer.length
        });

        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error generating PDF:", error);
        res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
});

// Get all bills
router.get('/', async (req, res, next) => {
    try {
        const bills = await getAll(`
            SELECT b.*, c.name as customer_name, c.phone_number 
            FROM bills b 
            JOIN customers c ON b.customer_id = c.id 
            ORDER BY b.bill_date DESC
        `);

        // Parse items JSON for each bill
        bills.forEach(bill => {
            bill.items = JSON.parse(bill.items);
        });

        res.json({
            success: true,
            data: bills
        });
    } catch (err) {
        next(err);
    }
});

// Get single bill
router.get('/:id', async (req, res, next) => {
    try {
        const bill = await getOne(`
            SELECT b.*, c.name as customer_name, c.phone_number 
            FROM bills b 
            JOIN customers c ON b.customer_id = c.id 
            WHERE b.id = ?
        `, [req.params.id]);

        if (!bill) {
            return res.status(404).json({
                success: false,
                message: 'Bill not found'
            });
        }

        // Parse items JSON
        bill.items = JSON.parse(bill.items);

        res.json({
            success: true,
            data: bill
        });
    } catch (err) {
        next(err);
    }
});

// Create new bill
router.post('/', async (req, res, next) => {
    try {
        const { 
            customer,
            items,
            discount_before_tax = 0,
            payment_method
        } = req.body;

        // Validate required fields
        if (!customer || !items || !payment_method || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Customer details, items, and payment method are required'
            });
        }

        // Start transaction
        await runQuery('BEGIN TRANSACTION');

        try {
            // Check/Create customer
            let customerRecord = await getOne(
                'SELECT * FROM customers WHERE phone_number = ?',
                [customer.phone_number]
            );

            if (!customerRecord) {
                const result = await runQuery(
                    'INSERT INTO customers (name, phone_number) VALUES (?, ?)',
                    [customer.name, customer.phone_number]
                );
                customerRecord = await getOne(
                    'SELECT * FROM customers WHERE id = ?',
                    [result.lastID]
                );
            }

            // Process items and update inventory
            for (const item of items) {
                if (item.inventory_id) {
                    const inventoryItem = await getOne(
                        'SELECT * FROM inventory WHERE id = ?',
                        [item.inventory_id]
                    );
                    
                    if (!inventoryItem) {
                        throw new Error(`Inventory item ${item.inventory_id} not found`);
                    }

                    if (inventoryItem.quantity < item.quantity) {
                        throw new Error(`Insufficient quantity for item ${inventoryItem.item_name}`);
                    }

                    // Update inventory quantity
                    await runQuery(
                        'UPDATE inventory SET quantity = quantity - ? WHERE id = ?',
                        [item.quantity, item.inventory_id]
                    );
                }
            }

            // Calculate bill amounts
            const sub_total = items.reduce((total, item) => 
                total + (item.quantity * item.unit_price), 0);
            
            const taxable_amount = sub_total - discount_before_tax;
            const cgst = taxable_amount * CGST_RATE;
            const sgst = taxable_amount * SGST_RATE;
            const total_amount = taxable_amount + cgst + sgst;

            // Create bill
            const result = await runQuery(`
                INSERT INTO bills (
                    customer_id, items, sub_total, discount_before_tax,
                    taxable_amount, cgst, sgst, total_amount, payment_method
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                customerRecord.id,
                JSON.stringify(items),
                sub_total,
                discount_before_tax,
                taxable_amount,
                cgst,
                sgst,
                total_amount,
                payment_method
            ]);

            // Get created bill
            const newBill = await getOne(`
                SELECT b.*, c.name as customer_name, c.phone_number 
                FROM bills b 
                JOIN customers c ON b.customer_id = c.id 
                WHERE b.id = ?
            `, [result.lastID]);

            // Parse items JSON
            newBill.items = JSON.parse(newBill.items);

            // Generate WhatsApp share URL
            const whatsappUrl = `https://api.whatsapp.com/send?text=${generateBillText(
                newBill,
                { name: customerRecord.name, phone_number: customerRecord.phone_number },
                items
            )}`;

            // Commit transaction
            await runQuery('COMMIT');

            res.status(201).json({
                success: true,
                message: 'Bill created successfully',
                data: {
                    ...newBill,
                    whatsappUrl
                }
            });
        } catch (err) {
            // Rollback transaction on error
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        next(err);
    }
});

module.exports = router;