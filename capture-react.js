const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function captureReactForm() {
    const browser = await puppeteer.launch({
        headless: true
    });

    try {
        const page = await browser.newPage();

        console.log('Navigating to http://localhost:8016/product...');
        await page.goto('http://localhost:8016/product', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        console.log('Waiting for form to render...');
        await page.waitForSelector('.form-element-wrapper, .mb-3', {
            timeout: 10000
        });

        console.log('Getting form innerHTML...');
        const formHTML = await page.evaluate(() => {
            // Try to find the form element
            const form = document.querySelector('form');
            if (form) {
                return form.innerHTML;
            }
            // Fallback: get the main content area
            const container = document.querySelector('.form-element-wrapper, .mb-3');
            if (container) {
                return container.parentElement.innerHTML;
            }
            return document.body.innerHTML;
        });

        const outputPath = path.join(__dirname, 'compare', 'react-output.html');
        fs.writeFileSync(outputPath, formHTML, 'utf8');

        console.log(`Form HTML saved to: ${outputPath}`);
        console.log(`File size: ${formHTML.length} bytes`);

    } catch (error) {
        console.error('Error capturing form:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

captureReactForm();
