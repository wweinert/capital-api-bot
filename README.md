# Capital API Trading Bot

Backend-oriented Node.js project for API integration, strategy logic, market data processing, structured logging and backtesting.

The project focuses on backend architecture, data handling and modular strategy execution. It is part of my technical portfolio and demonstrates how I work with external APIs, asynchronous data flows and structured application logic.

> This project is for technical and educational purposes only. It is not financial advice.

## Features

- Broker/API communication
- Market data processing
- Modular strategy logic
- Technical indicator calculation
- Risk-management logic with SL/TP handling
- Structured trade and market-data logging
- Backtesting support
- Separation of services, indicators, strategies and utilities

## Tech Stack

- Node.js
- JavaScript ES Modules
- REST APIs
- WebSocket communication
- Axios / node-fetch
- technicalindicators
- dotenv
- Mocha basics

## Project Structure

```text
bot.js          Main runtime entry point
services/       API communication and external integrations
strategies/     Trading and signal logic
indicators/     Technical indicator calculations
backtest/       Backtesting / replay logic
utils/          Shared helper functions
logs/           Local runtime logs
```

## Setup

```bash
npm install
npm run start
```

Backtesting:

```bash
npm run backtest
```

Environment variables and API credentials are intentionally not included in the repository.

## What this project demonstrates

- Working with external APIs
- Structuring backend logic in modules
- Processing time-series data
- Building strategy and risk-management logic
- Logging runtime data for later analysis
- Iterative development and testing of backend workflows
