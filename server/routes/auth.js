const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

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

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Generate OTP
            const otp = generateOTP();
            const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

            // Insert new enterprise
            const sql = `
                INSERT INTO enterprises (
                    enterprise_name, owner_name, phone_number, email, 
                    address, gst_number, password, otp, otp_expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(sql, [
                enterprise_name,
                owner_name,
                phone_number,
                email || null,
                address,
                gst_number || null,
                hashedPassword,
                otp,
                otpExpiresAt.toISOString()
            ], function(err) {
                if (err) {
                    console.error('Error inserting enterprise:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to register enterprise'
                    });
                }

                // In a real application, send OTP via SMS
                console.log('OTP for testing:', otp);

                res.json({
                    success: true,
                    message: 'Enterprise registered successfully. Please verify your phone number.',
                    requiresOTP: true
                });
            });
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
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
        function(err) {
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

            // In a real application, send OTP via SMS
            console.log('New OTP for testing:', otp);

            res.json({
                success: true,
                message: 'OTP resent successfully'
            });
        }
    );
});

// Login
router.post('/login', (req, res) => {
    const { phone_number, password } = req.body;

    if (!phone_number || !password) {
        return res.status(400).json({
            success: false,
            message: 'Please provide phone number and password'
        });
    }

    db.get('SELECT * FROM enterprises WHERE phone_number = ?', [phone_number], async (err, enterprise) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }

        if (!enterprise) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if enterprise is verified
        if (!enterprise.is_verified) {
            // Generate new OTP for unverified enterprise
            const otp = generateOTP();
            const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

            db.run(
                'UPDATE enterprises SET otp = ?, otp_expires_at = ? WHERE id = ?',
                [otp, otpExpiresAt.toISOString(), enterprise.id],
                (err) => {
                    if (err) {
                        console.error('Error updating OTP:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Internal server error'
                        });
                    }

                    // In a real application, send OTP via SMS
                    console.log('OTP for testing:', otp);

                    return res.json({
                        success: true,
                        message: 'Please verify your phone number',
                        requiresOTP: true
                    });
                }
            );
            return;
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, enterprise.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
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