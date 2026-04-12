# JanSetu - Real-time Disease Surveillance & AI-Driven Supply Chain Optimization

## Problem Statement
In rural India, disease surveillance is often fragmented, leading to delayed outbreak detection and inefficient medical supply chain management. Healthcare professionals struggle with inadequate data and slow responsiveness to emerging health threats.

## Solution
JanSetu addresses these challenges by enabling real-time ASHA (Agniveer Health and Safety Ambassadors) field data collection, comprehensive analysis of medical shop operations, and the correlation between disease outbreaks and demand for medical supplies. Our predictive supply chain optimization ensures that resources are allocated efficiently, enhancing the overall healthcare response.

## Key Features
- **Demand Forecasting:** Leverage historical data to accurately predict future medical supply needs.
- **Price Anomaly Detection:** Identify and alert stakeholders about fluctuations in medicine prices to safeguard affordability.
- **Outbreak Prediction:** Use AI-driven models to forecast potential disease outbreaks based on current data trends.

## System Architecture
JanSetu operates on a dual backend setup to ensure reliability and performance, encompassing:
- A primary backend for data collection and processing.
- A secondary backup system for data redundancy and service continuity.

## Technology Stack
- Backend: Node.js, Express
- Database: MongoDB
- Frontend: React
- AI/ML: TensorFlow, Scikit-learn
- Cloud Services: AWS, Azure
- Data Visualization: D3.js

## Quick Start Guide
1. Clone the repository:
   ```bash
   git clone https://github.com/sumitsingh24k/Health_system.git
   ```
2. Install dependencies:
   ```bash
   cd Health_system
   npm install
   ```
3. Set up the environment variables:
   - Create a `.env` file in the root directory and add your configuration settings.
4. Start the application:
   ```bash
   npm start
   ```
5. Open your browser and navigate to `http://localhost:3000` to access the application.

For more detailed instructions, refer to the [Documentation](https://github.com/sumitsingh24k/Health_system/wiki).