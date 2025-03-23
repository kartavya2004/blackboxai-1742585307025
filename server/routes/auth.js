const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch'); // Make sure to install node-fetch

// Connect to SQLite database
const db = new sqlite3.Database('./server/erp.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
    } else {
        console.log('Connected to SQLite database');
        // Create enterprises table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS enterprises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            enterprise_name TEXT NOT NULL,
            owner_name TEXT NOT NULL,
            phone_number TEXT UNIQUE NOT NULL,
            email TEXT,
            address TEXT NOT NULL,
            gst_number TEXT,
            password TEXT NOT NULL,
            otp TEXT,
            otp_expires_at DATETIME,
            is_verified BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Generate OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Register new enterprise
router.post('/register', async (req, res) => {
    try {
        const {
            enterprise_name,
            owner_name,
            phone_number,
            email,
            address,
            gst_number,
            password
        } = req.body;

        // Validate required fields
        if (!enterprise_name || !owner_name || !phone_number || !address || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Check if phone number already exists
        db.get('SELECT id FROM enterprises WHERE phone_number = ?', [phone_number], async (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
            if (row) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number already registered'
                });
            }

            // Generate OTP
            const otp = generateOTP();
            const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

            // Hash the password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert new enterprise
            db.run(`INSERT INTO enterprises (
                enterprise_name, owner_name, phone_number, email, address, gst_number, password, otp, otp_expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                enterprise_name,
                owner_name,
                phone_number,
                email || null,
                address,
                gst_number || null,
                hashedPassword,
                otp,
                otpExpiresAt.toISOString()
            ], async (err) => {
                if (err) {
                    console.error('Error inserting enterprise:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to register enterprise'
                    });
                }

                // Send OTP to user's phone number using Twilio
                const otpMessage = `Your OTP is: ${otp}`;
                const url = `https://api.twilio.com/2010-04-01/Accounts/your-twilio-account-sid/Messages.json`;
                const headers = {
                    'Authorization': 'Basic ' + Buffer.from('your-twilio-account-sid:your-twilio-account-token').toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                };
                const body = new URLSearchParams({
                    'To': phone_number,
                    'From': 'your-twilio-phone-number',
                    'Body': otpMessage
                });

                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: headers,
                        body: body
                    });

                    if (!response.ok) {
                        console.error('Error sending OTP:', response.status);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to send OTP'
                        });
                    }

                    console.log('OTP sent successfully');
                    return res.status(201).json({
                        success: true,
                        message: 'Enterprise registered successfully. Please verify your phone number.',
                        requiresOTP: true
                    });
                } catch (error) {
                    console.error('Error sending OTP:', error);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to send OTP'
                    });
                }
            });
        });
    } catch (error) {
        console.error('Error registering enterprise:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to register enterprise'
        });
    }
});

// Verify OTP
router.post('/verify-otp', (req, res) => {
    const { phone_number, otp } = req.body;

    if (!phone_number || !otp) {
        return res.status(400).json({
            success: false,
            message: 'Please provide phone number and OTP'
        });
    }

    db.get(
        'SELECT * FROM enterprises WHERE phone_number = ? AND otp = ? AND otp_expires_at > datetime("now")',
        [phone_number, otp],
        (err, enterprise) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }

            if (!enterprise) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired OTP'
                });
            }

            // Mark enterprise as verified
            db.run(
                'UPDATE enterprises SET is_verified = 1, otp = NULL, otp_expires_at = NULL WHERE id = ?',
                [enterprise.id],
                (err) => {
                    if (err) {
                        console.error('Error updating enterprise:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to verify enterprise'
                        });
                    }

                    // Generate JWT token
                    const token = jwt.sign(
                        { id: enterprise.id, phone_number: enterprise.phone_number },
                        process.env.JWT_SECRET || 'your-secret-key',
                        { expiresIn: '24h' }
                    );

                    res.json({
                        success: true,
                        message: 'Phone number verified successfully',
                        token,
                        enterprise: {
                            id: enterprise.id,
                            enterprise_name: enterprise.enterprise_name,
                            owner_name: enterprise.owner_name,
                            phone_number: enterprise.phone_number,
                            email: enterprise.email,
                            address: enterprise.address,
                            gst_number: enterprise.gst_number
                        }
                    });
                }
            );
        }
    );
});

// Resend OTP
router.post('/resend-otp', (req, res) => {
    const { phone_number } = req.body;

    if (!phone_number) {
        return res.status(400).json({
            success: false,
            message: 'Please provide phone number'
        });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

    db.run(
        'UPDATE enterprises SET otp = ?, otp_expires_at = ? WHERE phone_number = ?',
        [otp, otpExpiresAt.toISOString(), phone_number],
        async function(err) {
            if (err) {
                console.error('Error updating OTP:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to resend OTP'
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Phone number not found'
                });
            }

            // Send new OTP via SMS
            const otpMessage = `Your new OTP is: ${otp}`;
            const url = `https://api.twilio.com/2010-04-01/Accounts/your-twilio-account-sid/Messages.json`;
            const headers = {
                'Authorization': 'Basic ' + Buffer.from('your-twilio-account-sid:your-twilio-account-token').toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            };
            const body = new URLSearchParams({
                'To': phone_number,
                'From': 'your-twilio-phone-number',
                'Body': otpMessage
            });

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: headers,
                    body: body
                });

                if (!response.ok) {
                    console.error('Error sending new OTP:', response.status);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to send new OTP'
                    });
                }

                console.log('New OTP sent successfully');
                res.json({
                    success: true,
                    message: 'OTP resent successfully'
                });
            } catch (error) {
                console.error('Error sending new OTP:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to send new OTP'
                });
            }
        }
    );
});

// Login
router.post('/login', async (req, res) => {
    const { phone_number, password } = req.body;

    if (!phone_number || !password) {
        return res.status(400).json({ success: false, message: 'Please provide phone number and password' });
    }

    db.get('SELECT * FROM enterprises WHERE phone_number = ?', [phone_number], async (err, enterprise) => {
        if (err) {
            console.error('🔴 Database error:', err);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        if (!enterprise) {
            console.warn('🔴 Enterprise not found for:', phone_number);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, enterprise.password);
        if (!isValidPassword) {
            console.warn('🔴 Incorrect password for:', phone_number);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: enterprise.id, phone_number: enterprise.phone_number },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        console.log('🟢 Login successful:', phone_number);
        
        res.json({
            success: true,
            message: 'Logged in successfully',
            token,
            enterprise: {
                id: enterprise.id,
                enterprise_name: enterprise.enterprise_name,
                owner_name: enterprise.owner_name,
                phone_number: enterprise.phone_number,
                email: enterprise.email,
                address: enterprise.address,
                gst_number: enterprise.gst_number
            }
        });
    });
});

module.exports = router;