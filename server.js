const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
const port = 3000;

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/roxiler', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB', error);
  });

// Create a schema for product transactions
const productTransactionSchema = new mongoose.Schema({
  id: Number,
  title: String,
  price: Number,
  description: String,
  category: String,
  image: String,
  sold: Boolean,
  dateOfSale: Date
});

// Create a model for product transactions
const ProductTransaction = mongoose.model('ProductTransaction', productTransactionSchema);

// API to initialize the database
app.get('/api/initialize-database', async (req, res) => {
  try {
    const url = 'https://s3.amazonaws.com/roxiler.com/product_transaction.json';
    const response = await axios.get(url);
    const data = response.data;

    // Prepare seed data and map the fields
    const seedData = data.map(transaction => ({
      id: transaction.id,
      title: transaction.title,
      price: transaction.price,
      description: transaction.description,
      category: transaction.category,
      image: transaction.image,
      sold: transaction.sold,
      dateOfSale: new Date(transaction.dateOfSale)
    }));

    // Insert seed data into the database
    await ProductTransaction.insertMany(seedData);

    res.status(200).json({ message: 'Database initialized successfully' });
  } catch (error) {
    console.error('Error initializing database', error);
    res.status(500).json({ error: 'Failed to initialize database' });
  }
});

// API for statistics
app.get('/api/statistics', async (req, res) => {
  try {
    const month = req.query.month;

    const totalSaleAmount = await ProductTransaction.aggregate([
      {
        $match: {
          $expr: { $eq: [{ $month: '$dateOfSale' }, parseInt(month)] },
          sold: true // Filter documents where "sold" is true
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' }
        }
      }
    ]);

    const totalSoldItems = await ProductTransaction.countDocuments({
      $expr: { $eq: [{ $month: '$dateOfSale' }, parseInt(month)] },
      sold: true
    });

    const totalNotSoldItems = await ProductTransaction.countDocuments({
      $expr: { $eq: [{ $month: '$dateOfSale' }, parseInt(month)] },
      sold: false
    });

    res.status(200).json({
      totalSaleAmount: totalSaleAmount.length > 0 ? totalSaleAmount[0].total : 0,
      totalSoldItems,
      totalNotSoldItems
    });
  } catch (error) {
    console.error('Error fetching statistics', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// API for bar chart
app.get('/api/bar-chart', async (req, res) => {
  try {
    const month = req.query.month;

    const priceRanges = [
      { min: 0, max: 100 },
      { min: 101, max: 200 },
      { min: 201, max: 300 },
      { min: 301, max: 400 },
      { min: 401, max: 500 },
      { min: 501, max: 600 },
      { min: 601, max: 700 },
      { min: 701, max: 800 },
      { min: 801, max: 900 },
      { min: 901, max: Infinity }
    ];

    const barChartData = [];
    for (const range of priceRanges) {
      const count = await ProductTransaction.countDocuments({
        $expr: {
          $and: [
            { $eq: [{ $month: '$dateOfSale' }, parseInt(month)] },
            { $gte: ['$price', range.min] },
            { $lte: ['$price', range.max] }
          ]
        }
      });

      barChartData.push({
        priceRange: `${range.min}-${range.max}`,
        count
      });
    }

    res.status(200).json(barChartData);
  } catch (error) {
    console.error('Error fetching bar chart data', error);
    res.status(500).json({ error: 'Failed to fetch bar chart data' });
  }
});

// API for pie chart
app.get('/api/pie-chart', async (req, res) => {
  try {
    const month = req.query.month;

    const pieChartData = await ProductTransaction.aggregate([
      {
        $match: { $expr: { $eq: [{ $month: '$dateOfSale' }, parseInt(month)] } }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          category: '$_id',
          count: 1
        }
      }
    ]);

    res.status(200).json(pieChartData);
  } catch (error) {
    console.error('Error fetching pie chart data', error);
    res.status(500).json({ error: 'Failed to fetch pie chart data' });
  }
});

// API to fetch combined data
app.get('/api/combined-data', async (req, res) => {
  try {
    const month = req.query.month;

    const statisticsResponse = await axios.get(`http://localhost:${port}/api/statistics?month=${month}`);
    const barChartDataResponse = await axios.get(`http://localhost:${port}/api/bar-chart?month=${month}`);
    const pieChartDataResponse = await axios.get(`http://localhost:${port}/api/pie-chart?month=${month}`);

    const combinedData = {
      statistics: statisticsResponse.data,
      barChartData: barChartDataResponse.data,
      pieChartData: pieChartDataResponse.data
    };

    res.status(200).json(combinedData);
  } catch (error) {
    console.error('Error fetching combined data', error);
    res.status(500).json({ error: 'Failed to fetch combined data' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
