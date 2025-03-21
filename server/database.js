const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create a new database connection
const db = new sqlite3.Database(path.join(__dirname, 'erp.db'), (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        return;
    }
    console.log('Connected to SQLite database');
});

// Initialize database tables
const initDb = () => {
    db.serialize(() => {
        // Create customers table
        db.run(`CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone_number TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating customers table:', err);
        });

        // Create inventory table
        db.run(`CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_code TEXT UNIQUE NOT NULL,
            item_name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0
        )`, (err) => {
            if (err) console.error('Error creating inventory table:', err);
        });

        // Create bills table
        db.run(`CREATE TABLE IF NOT EXISTS bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            bill_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            items TEXT NOT NULL,
            sub_total REAL NOT NULL,
            discount_before_tax REAL DEFAULT 0,
            taxable_amount REAL NOT NULL,
            cgst REAL NOT NULL,
            sgst REAL NOT NULL,
            total_amount REAL NOT NULL,
            payment_method TEXT NOT NULL CHECK(payment_method IN ('Cash', 'UPI', 'Card')),
            FOREIGN KEY(customer_id) REFERENCES customers(id)
        )`, (err) => {
            if (err) console.error('Error creating bills table:', err);
        });
    });
};

// Initialize the database
initDb();

// Export database methods
module.exports = {
    db,
    // Helper function to run queries with promises
    runQuery: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    },
    // Helper function to get single row
    getOne: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },
    // Helper function to get multiple rows
    getAll: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};