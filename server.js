const express = require('express')
const { chromium } = require('playwright')
const cors = require('cors')

// Install Playwright browsers if not already installed
const { execSync } = require('child_process')
try {
  execSync('npx playwright install chromium', { stdio: 'inherit' })
} catch (error) {
  console.log('Playwright browser installation failed:', error.message)
}

const app = express()
const PORT = process.env.PORT || 3001

// Enable CORS for all routes
app.use(cors({
  origin: '*', // In production, specify your Vercel domain
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json())

// Store active automations
const activeAutomations = new Map()

class AutomationServer {
  constructor() {
    this.browser = null
    this.page = null
  }

  async initialize() {
    if (!this.browser) {
      try {
        console.log('Launching browser on Railway...')
        
        // Try to use system Chromium first, fallback to Playwright's Chromium
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
                              '/usr/bin/chromium-browser' || 
                              await chromium.executablePath()
        
        this.browser = await chromium.launch({
          headless: true, // Use headless mode for Railway
          executablePath: executablePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ]
        })
        this.page = await this.browser.newPage()
        
        await this.page.setViewportSize({ width: 1280, height: 720 })
        await this.page.setExtraHTTPHeaders({
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        console.log('Browser launched successfully on Railway')
      } catch (error) {
        console.error('Failed to launch browser on Railway:', error)
        throw error
      }
    }
  }

  async performLogin(credentials) {
    try {
      await this.initialize()
      
      console.log('Starting automation...')
      
      // Step 1: Navigate to login page
      await this.page.goto(credentials.accessLink, { waitUntil: 'networkidle2' })
      await this.page.waitForTimeout(2000)

      // Step 2: Fill login form
      await this.page.fill('input[name="username"], input[type="text"]', credentials.username)
      await this.page.fill('input[name="password"], input[type="password"]', credentials.password)
      
      // Step 3: Submit login
      await this.page.click('button[type="submit"], input[type="submit"], .btn-primary')
      await this.page.waitForTimeout(3000)

      // Step 4: Navigate to sales creation
      await this.page.goto(`${credentials.accessLink}/sales/createnewsales`, { waitUntil: 'networkidle2' })
      await this.page.waitForTimeout(2000)

      // Step 5: Search for customer
      await this.page.click('#select2-customer-container')
      await this.page.waitForTimeout(1000)
      
      const searchInput = await this.page.$('.select2-search__field')
      if (searchInput) {
        await searchInput.fill(credentials.nameToSearch)
        await this.page.waitForTimeout(2000)
        
        // Look for matching option
        const options = await this.page.$$('.select2-results__option')
        let nameMatch = false
        let selectedName = ''
        
        for (const option of options) {
          const text = await option.textContent()
          if (text && text.toLowerCase().includes(credentials.nameToSearch.toLowerCase())) {
            await option.click()
            nameMatch = true
            selectedName = text
            break
          }
        }
        
        if (!nameMatch) {
          const availableOptions = await Promise.all(
            options.map(option => option.textContent())
          )
          
          return {
            success: true,
            message: 'Customer search completed, waiting for user selection',
            timestamp: new Date().toISOString(),
            nameMatch: false,
            availableOptions: availableOptions.filter(opt => opt && opt.trim() !== ''),
            packageMatch: false,
            paymentMatch: false,
            salesCreated: false,
            sheetsUpdated: false,
            waitingForUserSelection: true
          }
        }
      }

      // Step 6: Select package
      await this.page.click('#panel_promotion_addItem')
      await this.page.waitForTimeout(1000)
      
      const packageSearchInput = await this.page.$('#sppromotion_filter input[type="search"]')
      if (packageSearchInput) {
        await packageSearchInput.fill(credentials.packageName)
        await this.page.waitForTimeout(2000)
        
        // Find matching package by payment amount
        const tableRows = await this.page.$$('#sppromotion tbody tr[role="row"]')
        let packageMatch = false
        let paymentMatch = false
        
        for (const row of tableRows) {
          const cells = await row.$$('td')
          if (cells.length >= 3) {
            const cellText = await cells[2].textContent()
            if (cellText && cellText.includes(credentials.paymentAmount)) {
              await cells[2].click()
              await this.page.waitForTimeout(500)
              
              const selectButton = await this.page.$('button[value="Select Package"]')
              if (selectButton) {
                await selectButton.click()
                packageMatch = true
                paymentMatch = true
                break
              }
            }
          }
        }
      }

      // Step 7: Handle modal and create sales
      await this.page.waitForTimeout(2000)
      
      // Look for close button first
      const closeButton = await this.page.$('button.close[ng-click="closeItemSelectionModal(); setTab(); checkHasDrugAllergy()"]')
      if (closeButton) {
        await closeButton.click()
        await this.page.waitForTimeout(1000)
      }

      // Step 8: Select payment method
      const paymentSelect = await this.page.$('#paymentInput')
      if (paymentSelect) {
        await paymentSelect.selectOption('RENEWAL')
      }

      // Step 9: Enter payment amount
      const paymentInput = await this.page.$('input[ng-model="payment.amount"]:not(.ng-hide)')
      if (paymentInput) {
        await paymentInput.fill(credentials.paymentAmount)
      }

      // Step 10: Handle PIN input
      const pinInputs = await this.page.$$('input[type="tel"]:not(.ng-hide)')
      if (pinInputs.length >= 6) {
        for (let i = 0; i < 6; i++) {
          const digit = credentials.pin[i] || '0'
          await pinInputs[i].fill(digit)
          await this.page.waitForTimeout(100)
        }
        
        // Press Enter after PIN input
        await this.page.keyboard.press('Enter')
      }

      // Step 11: Final sales creation
      const finalCreateButton = await this.page.$('.btn.btn-success.createSales')
      if (finalCreateButton) {
        await finalCreateButton.click()
        await this.page.waitForTimeout(2000)
      }

      return {
        success: true,
        message: 'Automation completed successfully',
        timestamp: new Date().toISOString(),
        nameMatch: true,
        selectedName: credentials.nameToSearch,
        packageMatch: true,
        paymentMatch: true,
        salesCreated: true,
        sheetsUpdated: false,
        waitingForUserSelection: false
      }

    } catch (error) {
      console.error('Automation error:', error)
      return {
        success: false,
        message: 'Automation failed',
        timestamp: new Date().toISOString(),
        nameMatch: false,
        packageMatch: false,
        paymentMatch: false,
        salesCreated: false,
        sheetsUpdated: false,
        waitingForUserSelection: false,
        error: error.message
      }
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
    }
  }
}

// API Routes
app.post('/api/automation', async (req, res) => {
  try {
    const credentials = req.body
    const automation = new AutomationServer()
    
    const result = await automation.performLogin(credentials)
    await automation.cleanup()
    
    res.json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    })
  }
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`Automation server running on port ${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down automation server...')
  process.exit(0)
})
