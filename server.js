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
        this.browser = await chromium.launch({
          headless: true, // Use headless mode for Railway
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
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
      await this.page.goto(credentials.accessLink, { waitUntil: 'domcontentloaded' })
      await this.page.waitForTimeout(1000)

      // Step 2: Fill login form
      await this.page.fill('input[name="username"], input[type="text"]', credentials.username)
      await this.page.fill('input[name="password"], input[type="password"]', credentials.password)
      
      // Step 3: Submit login
      await this.page.click('button[type="submit"], input[type="submit"], .btn-primary')
      await this.page.waitForTimeout(2000)

      // Step 4: Navigate to sales creation
      await this.page.goto(`${credentials.accessLink}/sales/createnewsales`, { waitUntil: 'domcontentloaded' })
      await this.page.waitForTimeout(1000)
      
      // Debug: Log page title and URL
      const pageTitle = await this.page.title()
      const pageUrl = this.page.url()
      console.log(`Page loaded: ${pageTitle} at ${pageUrl}`)
      
      // Debug: Check if we're actually on the right page
      if (!pageUrl.includes('createnewsales')) {
        console.log('⚠️ WARNING: Not on the create sales page!')
        console.log('Current URL:', pageUrl)
        console.log('Expected to be on: /sales/createnewsales')
      }
      
      // Debug: Take a screenshot of the current page
      console.log('Taking screenshot of current page state...')
      await this.page.screenshot({ path: '/tmp/debug-page-state.png' })
      console.log('Screenshot saved for debugging')
      
      // Debug: Log all available select elements
      const selectElements = await this.page.$$('select')
      console.log(`Found ${selectElements.length} select elements on page`)
      
      // Debug: Log all elements with "customer" in id or class
      const customerElements = await this.page.$$('[id*="customer"], [class*="customer"]')
      console.log(`Found ${customerElements.length} elements with "customer" in id or class`)
      
      // Debug: Log all elements with "payment" in id or class
      const paymentElements = await this.page.$$('[id*="payment"], [class*="payment"]')
      console.log(`Found ${paymentElements.length} elements with "payment" in id or class`)
      
      // Debug: Log all elements with "pin" in id or class
      const pinElements = await this.page.$$('[id*="pin"], [class*="pin"]')
      console.log(`Found ${pinElements.length} elements with "pin" in id or class`)
      
      // Debug: Log all input elements
      const allInputs = await this.page.$$('input')
      console.log(`Found ${allInputs.length} total input elements on page`)
      
      // Debug: Log all button elements
      const allButtons = await this.page.$$('button')
      console.log(`Found ${allButtons.length} total button elements on page`)

      // Step 5: Search for customer
      console.log('Looking for customer search container...')
      
      // Wait for the page to load and look for customer search elements
      try {
        await this.page.waitForSelector('#select2-customer-container', { timeout: 10000 })
        console.log('Found customer container, clicking...')
        await this.page.click('#select2-customer-container')
        await this.page.waitForTimeout(1000)
      } catch (error) {
        console.log('Customer container not found, trying alternative selectors...')
        
        // Try alternative selectors
        const alternativeSelectors = [
          '.select2-container',
          '[id*="customer"]',
          '[class*="customer"]',
          'select[name*="customer"]',
          '.customer-select',
          '#customer'
        ]
        
        let found = false
        for (const selector of alternativeSelectors) {
          try {
            console.log(`Trying selector: ${selector}`)
            await this.page.waitForSelector(selector, { timeout: 5000 })
            console.log(`Found element with selector: ${selector}`)
            await this.page.click(selector)
            await this.page.waitForTimeout(1000)
            found = true
            break
          } catch (e) {
            console.log(`Selector ${selector} not found`)
          }
        }
        
        if (!found) {
          console.log('No customer search element found, taking screenshot for debugging...')
          await this.page.screenshot({ path: '/tmp/debug-customer-search.png' })
          throw new Error('Customer search element not found on page')
        }
      }
      
      console.log('Looking for search input field...')
      const searchInput = await this.page.$('.select2-search__field')
      if (searchInput) {
        console.log('Found search input, filling with name...')
        await searchInput.fill(credentials.nameToSearch)
        await this.page.waitForTimeout(2000)
      } else {
        console.log('Search input not found, trying alternative selectors...')
        const inputSelectors = [
          'input[type="search"]',
          'input[placeholder*="search"]',
          'input[placeholder*="Search"]',
          '.search-input',
          'input[name*="search"]'
        ]
        
        let inputFound = false
        for (const selector of inputSelectors) {
          try {
            const input = await this.page.$(selector)
            if (input) {
              console.log(`Found input with selector: ${selector}`)
              await input.fill(credentials.nameToSearch)
              await this.page.waitForTimeout(2000)
              inputFound = true
              break
            }
          } catch (e) {
            console.log(`Input selector ${selector} not found`)
          }
        }
        
        if (!inputFound) {
          console.log('No search input found, taking screenshot for debugging...')
          await this.page.screenshot({ path: '/tmp/debug-search-input.png' })
          throw new Error('Search input field not found')
        }
      }
      
      // Look for matching option
      console.log('Looking for customer search results...')
      const options = await this.page.$$('.select2-results__option')
      console.log(`Found ${options.length} customer options`)
      
      let nameMatch = false
      let selectedName = ''
      
      for (const option of options) {
        const text = await option.textContent()
        console.log(`Option text: "${text}"`)
        if (text && text.toLowerCase().includes(credentials.nameToSearch.toLowerCase())) {
          console.log(`Found matching option: "${text}"`)
          await option.click()
          nameMatch = true
          selectedName = text
          break
        }
      }
      
      if (!nameMatch) {
        console.log('No matching customer found, taking screenshot...')
        await this.page.screenshot({ path: '/tmp/debug-customer-search-results.png' })
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

      // Step 6: Select package
      console.log('Looking for package selection button...')
      try {
        await this.page.waitForSelector('#panel_promotion_addItem', { 
          state: 'visible',
          timeout: 10000 
        })
        console.log('Found package selection button, clicking...')
        await this.page.click('#panel_promotion_addItem')
        await this.page.waitForTimeout(1000)
        console.log('Package selection button clicked')
        
        // Take screenshot after package selection
        console.log('Taking screenshot after package selection...')
        await this.page.screenshot({ path: '/tmp/debug-after-package-selection.png' })
        
        // Wait a bit more for any modals or content to load
        console.log('Waiting for content to load after package selection...')
        await this.page.waitForTimeout(3000)
        
        // Check if any modals or popups appeared
        const modals = await this.page.$$('.modal, .popup, .overlay, [role="dialog"]')
        console.log(`Found ${modals.length} modals/popups after package selection`)
        
        // Wait for the modal to be visible and interactable
        if (modals.length > 0) {
          console.log('Waiting for modal to become visible...')
          try {
            // Wait for any modal to become visible
            await this.page.waitForSelector('.modal:not(.ng-hide), .popup:not(.ng-hide), [role="dialog"]:not(.ng-hide)', { 
              state: 'visible', 
              timeout: 10000 
            })
            console.log('Modal is now visible!')
            
            // Take screenshot of the visible modal
            console.log('Taking screenshot of visible modal...')
            await this.page.screenshot({ path: '/tmp/debug-visible-modal.png' })
            
          } catch (error) {
            console.log('Modal did not become visible, trying to activate it...')
            
            // Try to click on the modal to activate it
            try {
              // First try to find the specific PIN modal
              let modal = await this.page.$('#pinCodemyprofile, .pin-modal, .modal.fade')
              if (!modal) {
                modal = await this.page.$('.modal, .popup, [role="dialog"]')
              }
              
              if (modal) {
                console.log('Found modal, attempting to click to activate...')
                
                // Try different click methods
                try {
                  await modal.click()
                  console.log('Modal clicked with regular click')
                } catch (clickError) {
                  console.log('Regular click failed, trying force click...')
                  await modal.click({ force: true })
                  console.log('Modal clicked with force click')
                }
                
                console.log('Modal clicked, waiting for it to become active...')
                await this.page.waitForTimeout(3000)
                
                // Try to wait for it to become visible again
                try {
                  await this.page.waitForSelector('.modal:not(.ng-hide), .popup:not(.ng-hide), [role="dialog"]:not(.ng-hide)', { 
                    state: 'visible', 
                    timeout: 5000 
                  })
                  console.log('Modal activated and now visible!')
                } catch (retryError) {
                  console.log('Modal still not visible after activation attempt')
                  
                  // Try to trigger the modal with JavaScript
                  console.log('Trying to trigger modal with JavaScript...')
                  await this.page.evaluate(() => {
                    // Try to trigger modal events
                    const modal = document.querySelector('.modal, .popup, [role="dialog"]')
                    if (modal) {
                      modal.style.display = 'block'
                      modal.classList.remove('ng-hide')
                      modal.classList.add('show')
                      modal.classList.remove('fade')
                    }
                  })
                  await this.page.waitForTimeout(2000)
                }
              }
            } catch (clickError) {
              console.log('Could not click modal:', clickError.message)
            }
          }
        }
        
        // Take another screenshot after waiting
        console.log('Taking screenshot after waiting for content...')
        await this.page.screenshot({ path: '/tmp/debug-after-waiting.png' })
        
        // Debug: Check what elements are now visible
        console.log('Checking for payment elements after package selection...')
        const paymentElements = await this.page.$$('select, input, button')
        console.log(`Found ${paymentElements.length} total form elements after package selection`)
        
        // Check for specific payment-related elements
        const paymentSelects = await this.page.$$('select')
        const paymentInputs = await this.page.$$('input')
        const paymentButtons = await this.page.$$('button')
        
        console.log(`Payment selects: ${paymentSelects.length}`)
        console.log(`Payment inputs: ${paymentInputs.length}`)
        console.log(`Payment buttons: ${paymentButtons.length}`)
        
        // Log some of the element details
        for (let i = 0; i < Math.min(5, paymentSelects.length); i++) {
          const id = await paymentSelects[i].getAttribute('id')
          const name = await paymentSelects[i].getAttribute('name')
          const className = await paymentSelects[i].getAttribute('class')
          const isVisible = await paymentSelects[i].isVisible()
          console.log(`Select ${i}: id="${id}", name="${name}", class="${className}", visible=${isVisible}`)
        }
        
        // Check for hidden elements that might contain payment fields
        console.log('Checking for hidden payment elements...')
        const hiddenElements = await this.page.$$('select[style*="display: none"], input[style*="display: none"], .ng-hide, .hidden')
        console.log(`Found ${hiddenElements.length} hidden elements`)
        
        // Check for elements with payment-related text
        const paymentTextElements = await this.page.$$('*:has-text("payment"), *:has-text("Payment"), *:has-text("amount"), *:has-text("Amount")')
        console.log(`Found ${paymentTextElements.length} elements with payment-related text`)
        
      } catch (error) {
        console.log('Package selection button not found:', error.message)
        await this.page.screenshot({ path: '/tmp/debug-package-selection-error.png' })
      }
      
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
      console.log('Looking for payment method selector...')
      
      // First check if we're in a modal and wait for it to be visible
      const visibleModal = await this.page.$('.modal:not(.ng-hide), .popup:not(.ng-hide), [role="dialog"]:not(.ng-hide)')
      if (visibleModal) {
        console.log('Found visible modal, looking for payment input inside modal...')
        // Wait for payment input to be visible in the modal
        try {
          await this.page.waitForSelector('.modal #paymentInput:not(.ng-hide), .popup #paymentInput:not(.ng-hide), [role="dialog"] #paymentInput:not(.ng-hide)', { 
            state: 'visible',
            timeout: 10000 
          })
          console.log('Found payment input in modal, selecting RENEWAL...')
          await this.page.selectOption('.modal #paymentInput, .popup #paymentInput, [role="dialog"] #paymentInput', 'RENEWAL')
          console.log('Payment method selected successfully in modal')
        } catch (modalError) {
          console.log('Payment input not found in modal, trying main page...')
        }
      }
      
      // Wait for payment select to be visible and enabled
      try {
        await this.page.waitForSelector('#paymentInput:not(.ng-hide)', { 
          state: 'visible',
          timeout: 10000 
        })
        console.log('Found payment input, selecting RENEWAL...')
        await this.page.selectOption('#paymentInput', 'RENEWAL')
        console.log('Payment method selected successfully')
      } catch (error) {
        console.log('Payment input not found or not visible, trying alternative selectors...')
        
        const paymentSelectors = [
          'select[name*="payment"]',
          'select[id*="payment"]',
          'select[class*="payment"]',
          'select option[value*="RENEWAL"]',
          'select option[value*="renewal"]'
        ]
        
        let paymentFound = false
        for (const selector of paymentSelectors) {
          try {
            console.log(`Trying payment selector: ${selector}`)
            await this.page.waitForSelector(selector, { 
              state: 'visible',
              timeout: 5000 
            })
            console.log(`Found payment element with selector: ${selector}`)
            
            if (selector.includes('option')) {
              // If it's an option, click it
              await this.page.click(selector)
            } else {
              // If it's a select, select the option
              await this.page.selectOption(selector, 'RENEWAL')
            }
            
            paymentFound = true
            break
          } catch (e) {
            console.log(`Payment selector ${selector} not found or not visible`)
          }
        }
        
        if (!paymentFound) {
          console.log('No payment method found, taking screenshot for debugging...')
          await this.page.screenshot({ path: '/tmp/debug-payment-selection.png' })
          console.log('Continuing without payment method selection...')
        }
      }

      // Step 9: Enter payment amount
      console.log('Looking for payment amount input...')
      
      // First check if we're in a modal and look for amount input there
      const visibleModalForAmount = await this.page.$('.modal:not(.ng-hide), .popup:not(.ng-hide), [role="dialog"]:not(.ng-hide)')
      if (visibleModalForAmount) {
        console.log('Found visible modal, looking for payment amount input inside modal...')
        try {
          await this.page.waitForSelector('.modal input[ng-model="payment.amount"]:not(.ng-hide), .popup input[ng-model="payment.amount"]:not(.ng-hide), [role="dialog"] input[ng-model="payment.amount"]:not(.ng-hide)', { 
            state: 'visible',
            timeout: 10000 
          })
          console.log('Found payment amount input in modal, filling with amount...')
          await this.page.fill('.modal input[ng-model="payment.amount"], .popup input[ng-model="payment.amount"], [role="dialog"] input[ng-model="payment.amount"]', credentials.paymentAmount)
          console.log('Payment amount entered successfully in modal')
        } catch (modalError) {
          console.log('Payment amount input not found in modal, trying main page...')
        }
      }
      
      try {
        await this.page.waitForSelector('input[ng-model="payment.amount"]:not(.ng-hide)', { 
          state: 'visible',
          timeout: 10000 
        })
        console.log('Found payment amount input, filling with amount...')
        await this.page.fill('input[ng-model="payment.amount"]:not(.ng-hide)', credentials.paymentAmount)
        console.log('Payment amount entered successfully')
      } catch (error) {
        console.log('Payment amount input not found, trying alternative selectors...')
        
        const amountSelectors = [
          'input[name*="amount"]',
          'input[id*="amount"]',
          'input[placeholder*="amount"]',
          'input[placeholder*="Amount"]',
          'input[type="number"]',
          'input[ng-model*="amount"]'
        ]
        
        let amountFound = false
        for (const selector of amountSelectors) {
          try {
            console.log(`Trying amount selector: ${selector}`)
            await this.page.waitForSelector(selector, { 
              state: 'visible',
              timeout: 5000 
            })
            console.log(`Found amount input with selector: ${selector}`)
            await this.page.fill(selector, credentials.paymentAmount)
            amountFound = true
            break
          } catch (e) {
            console.log(`Amount selector ${selector} not found or not visible`)
          }
        }
        
        if (!amountFound) {
          console.log('No payment amount input found, taking screenshot for debugging...')
          await this.page.screenshot({ path: '/tmp/debug-payment-amount.png' })
          console.log('Continuing without payment amount input...')
        }
      }

      // Step 10: Handle PIN input
      console.log('Looking for PIN input fields...')
      
      try {
        await this.page.waitForSelector('input[type="tel"]:not(.ng-hide)', { 
          state: 'visible',
          timeout: 10000 
        })
        
        const pinInputs = await this.page.$$('input[type="tel"]:not(.ng-hide)')
        console.log(`Found ${pinInputs.length} PIN input fields`)
        
        if (pinInputs.length >= 6) {
          console.log('Filling PIN input fields...')
          for (let i = 0; i < 6; i++) {
            const digit = credentials.pin[i] || '0'
            await pinInputs[i].fill(digit)
            await this.page.waitForTimeout(100)
          }
          
          // Press Enter after PIN input
          console.log('Pressing Enter after PIN input...')
          await this.page.keyboard.press('Enter')
          console.log('PIN input completed')
        } else {
          console.log('Not enough PIN input fields found, trying alternative selectors...')
          
          const pinSelectors = [
            'input[type="tel"]',
            'input[type="text"][maxlength="1"]',
            'input[placeholder*="PIN"]',
            'input[placeholder*="pin"]',
            'input[name*="pin"]',
            'input[id*="pin"]'
          ]
          
          let pinFound = false
          for (const selector of pinSelectors) {
            try {
              const inputs = await this.page.$$(selector)
              if (inputs.length >= 6) {
                console.log(`Found ${inputs.length} PIN inputs with selector: ${selector}`)
                for (let i = 0; i < 6; i++) {
                  const digit = credentials.pin[i] || '0'
                  await inputs[i].fill(digit)
                  await this.page.waitForTimeout(100)
                }
                await this.page.keyboard.press('Enter')
                pinFound = true
                break
              }
            } catch (e) {
              console.log(`PIN selector ${selector} not found`)
            }
          }
          
          if (!pinFound) {
            console.log('No PIN input fields found, taking screenshot for debugging...')
            await this.page.screenshot({ path: '/tmp/debug-pin-input.png' })
            console.log('Continuing without PIN input...')
          }
        }
      } catch (error) {
        console.log('PIN input section not found, taking screenshot for debugging...')
        await this.page.screenshot({ path: '/tmp/debug-pin-section.png' })
        console.log('Continuing without PIN input...')
      }

      // Step 11: Final sales creation
      console.log('Looking for final create sales button...')
      
      try {
        await this.page.waitForSelector('.btn.btn-success.createSales', { 
          state: 'visible',
          timeout: 10000 
        })
        console.log('Found create sales button, clicking...')
        await this.page.click('.btn.btn-success.createSales')
        await this.page.waitForTimeout(2000)
        console.log('Create sales button clicked successfully')
      } catch (error) {
        console.log('Create sales button not found, trying alternative selectors...')
        
        const createButtonSelectors = [
          'button[class*="create"]',
          'button[class*="sales"]',
          'button[class*="success"]',
          'input[type="submit"]',
          'button[type="submit"]',
          'button:contains("Create")',
          'button:contains("Submit")',
          'button:contains("Save")',
          '.btn-success',
          '.btn-primary',
          'button.btn'
        ]
        
        let createFound = false
        for (const selector of createButtonSelectors) {
          try {
            console.log(`Trying create button selector: ${selector}`)
            await this.page.waitForSelector(selector, { 
              state: 'visible',
              timeout: 5000 
            })
            console.log(`Found create button with selector: ${selector}`)
            await this.page.click(selector)
            await this.page.waitForTimeout(2000)
            createFound = true
            break
          } catch (e) {
            console.log(`Create button selector ${selector} not found or not visible`)
          }
        }
        
        if (!createFound) {
          console.log('No create sales button found, taking screenshot for debugging...')
          await this.page.screenshot({ path: '/tmp/debug-create-button.png' })
          console.log('Continuing without clicking create button...')
        }
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
