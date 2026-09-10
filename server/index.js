const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Model
const Account = require('./models/Account');

// GET all accounts (for testing only)
app.get('/getAccounts', (req, res) => {
  Account.find()
    .then(accounts => res.json(accounts))
    .catch(err => res.json(err));
});

// Routes
const accountRoutes = require('./routes/account');
app.use('/api/accounts', accountRoutes);

// Start server
const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
