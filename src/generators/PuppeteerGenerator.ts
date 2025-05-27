import { TestScriptGenerator, TestGenerationOptions } from './TestScriptGenerator.js';
import * as fs from 'fs';
import * as path from 'path';

export class PuppeteerGenerator extends TestScriptGenerator {
  /**
   * Fonction de délai compatible avec toutes les versions de Puppeteer
   */
  private generateDelayFunction(): string {
    return `
// Fonction de délai compatible
function delay(time) {
  return new Promise(function(resolve) {
    setTimeout(resolve, time);
  });
}
`;
  }

  getSupportedType(): string {
    return 'puppeteer';
  }

  getFileExtension(): string {
    return '.js';
  }
  /**
 * ✅ NOUVEAU : Extrait le formControlName depuis l'ID généré
 * Ex: "input__name__uuid" → "name"
 */
private extractFormControlName(generatedId: string): string | null {
  if (!generatedId || typeof generatedId !== 'string') return null;
  
  const parts = generatedId.split('__');
  if (parts.length >= 3) {
    // Pattern: "input__name__uuid" → "name"
    // Pattern: "button__sign_up!__uuid" → "sign_up!"
    return parts[1];
  }
  return null;
}

/**
 * ✅ NOUVEAU : Extrait le texte du bouton depuis l'ID généré
 * Ex: "button__sign_up!__uuid" → "Sign Up!"
 */
private extractButtonText(generatedId: string): string | null {
  const formControlName = this.extractFormControlName(generatedId);
  if (!formControlName) return null;
  
  // Convertir "sign_up!" → "Sign Up!"
  return formControlName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/!/g, '!'); // Garder les caractères spéciaux
}

  private indent(code: string, level: number = 1): string {
    const prefix = '  '.repeat(level); // 2 espaces
    return code.split('\n').map(line => line ? prefix + line : '').join('\n');
  }

  /**
   * Génère un script Puppeteer JavaScript à partir d'un scénario généralisé
   */
  async generateScript(): Promise<string> {
    const waitTimeout = this.options.waitTimeout || 20000;
    const baseUrl = this.options.baseUrl || "http://localhost:4200";
    const scenario = this.options.formData;

    // Génère le code JavaScript pour chaque test/scénario
    let testsCode = '';
    for (const [testIdx, test] of scenario.entries()) {
      const route = test.route || '/';
      const steps = test.scenario || test.childs || [];
      const testFnName = `testCase${testIdx + 1}`;
      testsCode += this.generateTestFunction(testFnName, route, steps, waitTimeout, baseUrl);
      testsCode += '\n\n';
    }

    const template = `
/**
 * Puppeteer Test Script - Generated Automatically
 * ==============================================
 *
 * ⚠️ IMPORTANT: Before running this script, please:
 * 1. Make sure Chrome browser is installed
 * 2. Install puppeteer: npm install puppeteer
 * 3. Replace any 'FILE_PATH_HERE' with actual file paths for file uploads
 * 4. Verify that the base URL ('${baseUrl}') is correct for your application
 */

const puppeteer = require('puppeteer');

const BASE_URL = "${baseUrl}";
const WAIT_TIMEOUT = ${waitTimeout};

${this.generateDelayFunction()}

async function setupBrowser() {
  const browser = await puppeteer.launch({
    headless: false, // Set to true for headless mode
    devtools: false,
    slowMo: 50 // Slow down by 50ms for better visibility
  });
  return browser;
}

${testsCode}

async function runAllTests() {
  const browser = await setupBrowser();
  const page = await browser.newPage();
  
  try {
${(scenario as any[]).map((_: any, i: number) => `    await testCase${i + 1}(page);`).join('\n')}
  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    // await browser.close(); // Uncomment to close browser after tests
    console.log("All tests completed.");
  }
}

runAllTests();
`;

    return template;
  }

  /**
   * Génère le code d'une fonction de test pour un scénario donné
   */
  private generateTestFunction(fnName: string, route: string, steps: any[], waitTimeout: number, baseUrl: string): string {
    let code = `async function ${fnName}(page) {\n`;
    code += `  console.log("Running ${fnName} on route ${route}");\n`;
    code += `  await page.goto(\`\${BASE_URL}${route}\`);\n`;
    code += `  await delay(1000);\n`;

    for (const step of steps) {
      const { id, type, value } = step;
      if (!id || !type) continue;

      // Génération selon type
      switch (type) {
        case 'input':
        case 'text':
        case 'textarea':
        case 'number':
        case 'email':
        case 'password':
        case 'date':
        case 'color':
          // ✅ NULL CHECK ajouté
          if (value && typeof value === 'string' && value.includes("fakepath")) {
            code += this.generateFileUploadCode(id, value, waitTimeout);
          } else {
            code += this.generateInputCode(id, value, waitTimeout);
          }
          break;
        case 'mat-radio-group':
        case 'radio-group':
          code += this.generateRadioGroupCode(id, value, waitTimeout);
          break;
        case 'mat-select':
        case 'select':
          code += this.generateMatSelectCode(id, value, waitTimeout);
          break;
        case 'mat-button-toggle-group':
        case 'button-toggle-group':
          code += this.generateButtonToggleGroupCode(id, value, waitTimeout);
          break;
        case 'mat-checkbox':
        case 'checkbox':
          code += this.generateMatCheckboxCode(id, value, waitTimeout);
          break;
        case 'button':
        case 'submit':
          code += this.generateButtonCode(id, value, waitTimeout);
          break;
        default:
          code += `  // [WARN] Type '${type}' not handled for id '${id}'\n`;
      }
    }

    code += `  console.log("Test '${fnName}' completed.");\n`;
    return code + `}`;
  }
  /**
 * ✅ NOUVEAU : Convertit en camelCase
 */
private toCamelCase(str: string): string {
  if (!str) return '';
  return str.charAt(0).toLowerCase() + 
         str.slice(1)
            .replace(/[_-]([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * ✅ NOUVEAU : Convertit en PascalCase  
 */
private toPascalCase(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + 
         str.slice(1)
            .replace(/[_-]([a-z])/g, (_, char) => char.toUpperCase());
}

  private generateInputCode(id: string, value: any, waitTimeout: number): string {
  const formControlName = this.extractFormControlName(id);
  
  return `
  try {
    let inputFound = false;
    
    // ✅ STRATÉGIE 1 : Essayer variations de casse pour formControlName
    ${formControlName ? `
    if (!inputFound) {
      const variations = [
        "${formControlName}",  // Original
        "${this.toCamelCase(formControlName)}",  // camelCase
        "${this.toPascalCase(formControlName)}",  // PascalCase
        "${formControlName.toLowerCase()}",  // lowercase
      ];
      
      for (const variation of variations) {
        try {
          await page.waitForSelector(\`[formControlName="\${variation}"]\`, { timeout: 1000, visible: true });
          await page.focus(\`[formControlName="\${variation}"]\`);
          await page.evaluate((selector) => {
            document.querySelector(selector).value = '';
          }, \`[formControlName="\${variation}"]\`);
          await page.type(\`[formControlName="\${variation}"]\`, "${value}");
          inputFound = true;
          console.log(\`Filled input by formControlName variation: '\${variation}'\`);
          break;
        } catch (error) {
          continue;
        }
      }
    }
    ` : ''}
    
    // ✅ STRATÉGIE 2 : XPath case-insensitive (si Puppeteer supporte)
    ${formControlName ? `
    if (!inputFound) {
      try {
        const [element] = await page.$x(\`//input[translate(@formControlName, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')=translate('${formControlName}', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')]\`);
        if (element) {
          await element.focus();
          await element.evaluate(el => el.value = '');
          await element.type("${value}");
          inputFound = true;
          console.log("Filled input by case-insensitive XPath: '${formControlName}'");
        }
      } catch (error) {
        console.log("XPath case-insensitive strategy failed");
      }
    }
    ` : ''}
    
    // ✅ STRATÉGIE 3 : Essayer par ID généré
    if (!inputFound) {
      try {
        await page.waitForSelector('#${id}', { timeout: 2000, visible: true });
        await page.focus('#${id}');
        await page.evaluate((selector) => {
          document.querySelector(selector).value = '';
        }, '#${id}');
        await page.type('#${id}', "${value}");
        inputFound = true;
        console.log("Filled input by generated ID: '${id}'");
      } catch (error) {
        console.log("Generated ID strategy failed");
      }
    }
    
    if (!inputFound) {
      console.log("Warning: Could not find input with ID '${id}' or formControlName '${formControlName || 'unknown'}' using any strategy");
    }
  } catch (error) {
    console.log("Error filling input '${id}': " + error.message);
  }
`;
}

  private generateRadioGroupCode(id: string, value: any, waitTimeout: number): string {
    const stablePart = this.extractStableRadioGroupName(id);
    return `
  try {
    let radioSelected = false;
    
    // Stratégie 1: Cherche par ID stable + valeur (ex: "genderM" pour value="M")
    if ("${stablePart}" && "${value}") {
      try {
        const probableId = "${stablePart}" + "${value}".toUpperCase();
        await page.waitForSelector(\`#\${probableId}\`, { timeout: 2000 });
        await page.click(\`#\${probableId}\`);
        radioSelected = true;
        console.log(\`Selected radio '${stablePart}' with value '${value}' by probable ID: \${probableId}\`);
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 2: Cherche par name du groupe + valeur
    if (!radioSelected && "${stablePart}" && "${value}") {
      try {
        await page.waitForSelector(\`input[type="radio"][name="${stablePart}"][value="${value}"]\`, { timeout: 2000 });
        await page.click(\`input[type="radio"][name="${stablePart}"][value="${value}"]\`);
        radioSelected = true;
        console.log(\`Selected radio '${stablePart}' with value '${value}' by name and value\`);
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 3: Cherche dans le groupe mat-radio-group par valeur
    if (!radioSelected && "${value}") {
      try {
        await page.waitForSelector('mat-radio-group', { timeout: 2000 });
        await page.click(\`mat-radio-group mat-radio-button[value="${value}"]\`);
        radioSelected = true;
        console.log(\`Selected radio with value '${value}' in mat-radio-group\`);
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 4: Cherche par texte du bouton
    if (!radioSelected && "${value}") {
      try {
        const radioButton = await page.waitForXPath(\`//mat-radio-button[contains(., '${value}')]\`, { timeout: 2000 });
        await radioButton.click();
        radioSelected = true;
        console.log(\`Selected radio by text matching: '${value}'\`);
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 5: Fallback - cherche par partie stable de l'ID original
    if (!radioSelected && "${stablePart}") {
      try {
        const radios = await page.$$(\`[id*="${stablePart}"]\`);
        for (const radio of radios) {
          const type = await radio.evaluate(el => el.getAttribute('type'));
          const tagName = await radio.evaluate(el => el.tagName.toLowerCase());
          if (type === 'radio' || tagName === 'mat-radio-button') {
            const radioValue = await radio.evaluate(el => el.getAttribute('value') || '');
            if ("${value}".toLowerCase().includes(radioValue.toLowerCase())) {
              await radio.click();
              radioSelected = true;
              console.log(\`Selected radio by ID pattern and value matching\`);
              break;
            }
          }
        }
      } catch (error) {
        // Final strategy failed
      }
    }

    if (!radioSelected) {
      console.log("Warning: Could not select radio button for group '${id}' with value '${value}'");
      console.log("Tried strategies: probable ID, name+value, mat-radio-group, text matching, ID pattern");
    }

  } catch (error) {
    console.log(\`Error selecting radio button '${id}': \${error.message}\`);
  }
`;
  }

  /**
   * Extrait le nom stable d'un groupe de boutons radio
   */
  private extractStableRadioGroupName(id: string): string {
    if (!id || typeof id !== 'string') return '';
    const parts = id.split('__');
    if (parts.length >= 3 && parts[0] === 'mat-radio-group') {
      return parts[1];
    }
    return '';
  }

  private generateMatSelectCode(id: string, value: any, waitTimeout: number): string {
    const stablePart = this.extractStableSelectName(id);
    return `
  try {
    let optionSelected = false;
    
    // Stratégie 1: Cherche mat-select par ID exact
    try {
      await page.waitForSelector('#${id}', { timeout: ${waitTimeout} });
      await page.click('#${id}');
      await delay(1000);
      // Attendre que le panel de dropdown apparaisse
      await page.waitForSelector('.mat-select-panel, .mat-mdc-select-panel, mat-select-panel', { timeout: 8000 });
      
      // Stratégie A: JavaScript click direct (évite l'overlay)
      try {
        const option = await page.waitForSelector(\`mat-option[value="${value}"], mat-option:has-text("${value}")\`, { timeout: 5000 });
        await option.evaluate(el => el.click());
        optionSelected = true;
        console.log("Selected option '${value}' in mat-select '${id}' by exact ID (JS click)");
      } catch (error) {
        // Stratégie B: Ferme l'overlay d'abord, puis clique
        try {
          const overlay = await page.$('.cdk-overlay-backdrop');
          if (overlay) {
            await overlay.evaluate(el => el.click());
            await delay(300);
          }
          await page.click('#${id}');
          await delay(800);
          await page.click(\`mat-option:has-text("${value}")\`);
          optionSelected = true;
          console.log("Selected option '${value}' after closing overlay");
        } catch (error) {
          // Continue to next strategy
        }
      }
    } catch (error) {
      // Continue to next strategy
    }

    // Stratégie 2: Cherche mat-select par formControlName
    if (!optionSelected) {
      try {
        const controlName = "${stablePart}" || "${id}";
        await page.waitForSelector(\`mat-select[formcontrolname="\${controlName}"]\`, { timeout: 3000 });
        await page.click(\`mat-select[formcontrolname="\${controlName}"]\`);
        await delay(800);
        await page.waitForSelector('.mat-select-panel, .mat-mdc-select-panel', { timeout: 5000 });
        const option = await page.waitForSelector(\`mat-option[value="${value}"], mat-option:has-text("${value}")\`, { timeout: 5000 });
        await option.evaluate(el => el.click());
        optionSelected = true;
        console.log("Selected option '${value}' in mat-select by formControlName (JS click)");
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 3: Force click par coordonnées (dernier recours)
    if (!optionSelected) {
      try {
        await page.waitForSelector('#${id}', { timeout: 3000 });
        await page.evaluate((selector) => {
          document.querySelector(selector).scrollIntoView(true);
        }, '#${id}');
        await page.evaluate((selector) => {
          document.querySelector(selector).click();
        }, '#${id}');
        await delay(1000);
        const options = await page.$$('mat-option');
        for (const opt of options) {
          const text = await opt.evaluate(el => el.textContent || el.getAttribute('textContent') || '');
          if (text.includes("${value}")) {
            await opt.evaluate(el => el.click());
            optionSelected = true;
            console.log("Selected option '${value}' by force click");
            break;
          }
        }
      } catch (error) {
        // Final strategy failed
      }
    }

    if (!optionSelected) {
      console.log("Warning: Could not select option '${value}' in mat-select '${id}'");
      console.log("Tried strategies: exact ID (JS), formControlName, force click");
    }

  } catch (error) {
    console.log(\`Error selecting option in mat-select '${id}': \${error.message}\`);
  }
`;
  }

  /**
   * Extrait le nom stable d'un mat-select
   */
  private extractStableSelectName(id: string): string {
    if (!id || typeof id !== 'string') return '';
    const parts = id.split('__');
    if (parts.length >= 3 && parts[0] === 'mat-select') {
      return parts[1];
    }
    return id;
  }

  private generateButtonToggleGroupCode(id: string, value: any, waitTimeout: number): string {
    const stablePart = this.extractStableToggleGroupName(id);
    return `
  try {
    let toggleSelected = false;
    
    // Stratégie 1: Cherche mat-button-toggle-group par ID exact puis l'option
    try {
      await page.waitForSelector('#${id}', { timeout: ${waitTimeout} });
      await page.click(\`#${id} mat-button-toggle[value="${value}"]\`);
      toggleSelected = true;
      console.log("Selected button toggle '${value}' in group '${id}' by exact ID");
    } catch (error) {
      // Continue to next strategy
    }

    // Stratégie 2: Cherche mat-button-toggle-group par formControlName
    if (!toggleSelected && "${stablePart}") {
      try {
        await page.waitForSelector(\`mat-button-toggle-group[formcontrolname="${stablePart}"]\`, { timeout: 3000 });
        await page.click(\`mat-button-toggle-group[formcontrolname="${stablePart}"] mat-button-toggle[value="${value}"]\`);
        toggleSelected = true;
        console.log("Selected button toggle '${value}' by formControlName '${stablePart}'");
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 3: Cherche par partie stable de l'ID
    if (!toggleSelected && "${stablePart}") {
      try {
        await page.waitForSelector(\`[id*="${stablePart}"]\`, { timeout: 3000 });
        await page.click(\`[id*="${stablePart}"] mat-button-toggle[value="${value}"]\`);
        toggleSelected = true;
        console.log("Selected button toggle '${value}' by stable ID pattern");
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 4: Cherche par texte du bouton
    if (!toggleSelected) {
      try {
        const possibleTexts = ["${value}", "${value}%", "Level ${value}", "${value} %"];
        for (const text of possibleTexts) {
          try {
            const toggleButton = await page.waitForXPath(\`//mat-button-toggle[contains(., '\${text}')]\`, { timeout: 2000 });
            await toggleButton.click();
            toggleSelected = true;
            console.log(\`Selected button toggle by text matching: '\${text}'\`);
            break;
          } catch (error) {
            continue;
          }
        }
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 5: Cherche dans le premier groupe mat-button-toggle-group
    if (!toggleSelected) {
      try {
        await page.waitForSelector('mat-button-toggle-group', { timeout: 3000 });
        try {
          await page.click(\`mat-button-toggle-group mat-button-toggle[value="${value}"]\`);
          toggleSelected = true;
          console.log("Selected button toggle '${value}' in first group found");
        } catch (error) {
          const toggleButtons = await page.$$('mat-button-toggle-group mat-button-toggle');
          for (const btn of toggleButtons) {
            const text = await btn.evaluate(el => el.textContent || el.getAttribute('textContent') || '');
            if (text.includes("${value}")) {
              await btn.click();
              toggleSelected = true;
              console.log("Selected button toggle '${value}' by text in first group");
              break;
            }
          }
        }
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 6: Force click avec JavaScript (dernier recours)
    if (!toggleSelected) {
      try {
        const toggleButton = await page.waitForSelector(\`mat-button-toggle[value="${value}"], mat-button-toggle:has-text("${value}")\`, { timeout: 3000 });
        await toggleButton.evaluate(el => el.click());
        toggleSelected = true;
        console.log("Selected button toggle '${value}' by JavaScript click");
      } catch (error) {
        // Final strategy failed
      }
    }

    if (!toggleSelected) {
      console.log("Warning: Could not select button toggle '${value}' in group '${id}'");
      console.log("Tried strategies: exact ID, formControlName, stable ID, text matching, first group, JS click");
    }

  } catch (error) {
    console.log(\`Error selecting button toggle '${id}': \${error.message}\`);
  }
`;
  }

  /**
   * Extrait le nom stable d'un groupe de boutons toggle
   */
  private extractStableToggleGroupName(id: string): string {
    if (!id || typeof id !== 'string') return '';
    const parts = id.split('__');
    if (parts.length >= 3 && parts[0] === 'mat-button-toggle-group') {
      return parts[1];
    }
    return id;
  }

  private generateMatCheckboxCode(id: string, value: any, waitTimeout: number): string {
    const targetState = this.convertToJavaScriptBoolean(value);
    const stablePart = this.extractStableCheckboxName(id);
    return `
  try {
    let checkboxSelected = false;
    const targetState = ${targetState}; // true pour coché, false pour décoché
    
    // Stratégie 1: Clique sur le LABEL du mat-checkbox (le plus efficace)
    try {
      await page.waitForSelector('mat-checkbox[id="${id}"] label.mat-checkbox-layout', { timeout: ${waitTimeout} });
      const currentState = await page.evaluate((id) => {
        const checkbox = document.querySelector(\`mat-checkbox[id="\${id}"] input[type="checkbox"]\`);
        return checkbox ? checkbox.checked : false;
      }, "${id}");
      
      if (currentState !== targetState) {
        await page.click('mat-checkbox[id="${id}"] label.mat-checkbox-layout');
        checkboxSelected = true;
        console.log(\`Set mat-checkbox '${id}' to \${targetState} by clicking label\`);
      } else {
        checkboxSelected = true;
        console.log(\`Mat-checkbox '${id}' already in desired state: \${targetState}\`);
      }
    } catch (error) {
      // Continue to next strategy
    }

    // Stratégie 2: Clique directement sur l'input interne
    if (!checkboxSelected) {
      try {
        await page.waitForSelector('mat-checkbox[id="${id}"] input[type="checkbox"]', { timeout: 3000 });
        const currentState = await page.evaluate((id) => {
          const checkbox = document.querySelector(\`mat-checkbox[id="\${id}"] input[type="checkbox"]\`);
          return checkbox ? checkbox.checked : false;
        }, "${id}");
        
        if (currentState !== targetState) {
          await page.evaluate((id) => {
            const checkbox = document.querySelector(\`mat-checkbox[id="\${id}"] input[type="checkbox"]\`);
            if (checkbox) checkbox.click();
          }, "${id}");
          checkboxSelected = true;
          console.log(\`Set mat-checkbox '${id}' to \${targetState} by JS click on input\`);
        } else {
          checkboxSelected = true;
          console.log(\`Mat-checkbox '${id}' already in desired state via input\`);
        }
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 3: Utilise formControlName pour trouver et cliquer sur le label
    if (!checkboxSelected && "${stablePart}") {
      try {
        await page.waitForSelector(\`mat-checkbox[formcontrolname="${stablePart}"] label\`, { timeout: 3000 });
        const currentState = await page.evaluate((stablePart) => {
          const checkbox = document.querySelector(\`mat-checkbox[formcontrolname="\${stablePart}"] input[type="checkbox"]\`);
          return checkbox ? checkbox.checked : false;
        }, "${stablePart}");
        
        if (currentState !== targetState) {
          await page.click(\`mat-checkbox[formcontrolname="${stablePart}"] label\`);
          checkboxSelected = true;
          console.log(\`Set mat-checkbox to \${targetState} by formControlName label click\`);
        } else {
          checkboxSelected = true;
          console.log(\`Mat-checkbox already in desired state via formControlName\`);
        }
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 4: Premier mat-checkbox de la page (dernier recours)
    if (!checkboxSelected) {
      try {
        await page.waitForSelector('mat-checkbox', { timeout: 3000 });
        const currentState = await page.evaluate(() => {
          const checkbox = document.querySelector('mat-checkbox input[type="checkbox"]');
          return checkbox ? checkbox.checked : false;
        });
        
        if (currentState !== targetState) {
          await page.click('mat-checkbox label.mat-checkbox-layout');
          checkboxSelected = true;
          console.log(\`Set first mat-checkbox to \${targetState} by label click\`);
        } else {
          checkboxSelected = true;
          console.log(\`First mat-checkbox already in desired state\`);
        }
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Stratégie 5: Dispatch d'événement (dernier recours)
    if (!checkboxSelected) {
      try {
        await page.waitForSelector('mat-checkbox input[type="checkbox"]', { timeout: 3000 });
        const currentState = await page.evaluate(() => {
          const checkbox = document.querySelector('mat-checkbox input[type="checkbox"]');
          return checkbox ? checkbox.checked : false;
        });
        
        if (currentState !== targetState) {
          await page.evaluate((targetState) => {
            const checkbox = document.querySelector('mat-checkbox input[type="checkbox"]');
            if (checkbox) {
              checkbox.checked = targetState;
              const event = new Event('change', { bubbles: true });
              checkbox.dispatchEvent(event);
            }
          }, targetState);
          checkboxSelected = true;
          console.log(\`Set mat-checkbox to \${targetState} by dispatching change event\`);
        } else {
          checkboxSelected = true;
          console.log(\`Mat-checkbox already in desired state\`);
        }
      } catch (error) {
        // Final strategy failed
      }
    }

    if (!checkboxSelected) {
      console.log("Warning: Could not find or set mat-checkbox '${id}' to " + targetState);
      console.log("Tried strategies: label click, input JS click, formControlName label, first checkbox, event dispatch");
    }

  } catch (error) {
    console.log(\`Error handling mat-checkbox '${id}': \${error.message}\`);
  }
`;
  }

  /**
   * Convertit une valeur JavaScript en booléen JavaScript correct
   */
  private convertToJavaScriptBoolean(value: any): string {
    if (value === true || value === "true" || value === "selected" || value === "checked" || value === 1 || value === "1") {
      return "true";
    }
    return "false";
  }

  /**
   * Extrait le nom stable d'un mat-checkbox
   */
  private extractStableCheckboxName(id: string): string {
    if (!id || typeof id !== 'string') return '';
    const parts = id.split('__');
    if (parts.length >= 3 && parts[0] === 'mat-checkbox') {
      return parts[1];
    }
    return id;
  }

  private generateButtonCode(id: string, value: any, waitTimeout: number): string {
  const shouldClick = this.shouldClickButton(value);
  if (!shouldClick) {
    return `
  // Button '${id}' is set to NOT be clicked (value: '${value}')
  console.log("Skipping button '${id}' - value indicates no click required");
`;
  }

  const buttonText = this.extractButtonText(id);
  const formControlName = this.extractFormControlName(id);
  
  return `
  try {
    let button = null;
    let strategyUsed = "";
    let buttonFound = false;
    
    // ✅ STRATÉGIE 1 : Essayer par texte exact et variations (case-insensitive)
    ${buttonText ? `
    const textVariations = [
      "${buttonText}",  // Texte extrait exact
      "${buttonText.toLowerCase()}",  // lowercase
      "${buttonText.toUpperCase()}",  // UPPERCASE
      "${buttonText.replace(/[^a-zA-Z0-9\s]/g, '')}",  // Sans caractères spéciaux
    ];
    
    for (const text of textVariations) {
      if (!buttonFound && text.trim()) {
        try {
          // Essayer avec XPath case-insensitive
          const [element] = await page.$x(\`//button[translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')=translate(normalize-space('\${text}'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')]\`);
          if (element) {
            button = element;
            buttonFound = true;
            strategyUsed = \`case-insensitive text: '\${text}'\`;
            console.log(\`✅ Strategy 1 SUCCESS: Found button by case-insensitive text: '\${text}'\`);
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
    ` : ''}
    
    // ✅ STRATÉGIE 2 : Essayer spécifiquement par type submit avec texte
    if (!buttonFound) {
      try {
        console.log("Testing strategy 2: Submit button with keywords");
        const submitKeywords = ["sign", "up", "submit", "register", "create", "send"];
        
        for (const keyword of submitKeywords) {
          try {
            const [element] = await page.$x(\`//button[@type='submit' and contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '\${keyword}')]\`);
            if (element) {
              button = element;
              buttonFound = true;
              strategyUsed = \`submit with keyword: '\${keyword}'\`;
              console.log(\`✅ Strategy 2 SUCCESS: Found submit button containing keyword: '\${keyword}'\`);
              break;
            }
          } catch (error) {
            continue;
          }
        }
      } catch (error) {
        console.log("❌ Strategy 2 FAILED: " + error.message);
      }
    }
    
    // ✅ STRATÉGIE 3 : Essayer par type submit simple (fallback)
    if (!buttonFound) {
      try {
        console.log("Testing strategy 3: Simple submit button");
        await page.waitForSelector('button[type="submit"]', { timeout: 2000, visible: true });
        button = await page.$('button[type="submit"]');
        if (button) {
          buttonFound = true;
          strategyUsed = "submit type (fallback)";
          console.log("✅ Strategy 3 SUCCESS: Found button by submit type");
        }
      } catch (error) {
        console.log("❌ Strategy 3 FAILED: " + error.message);
      }
    }
    
    // ✅ STRATÉGIE 4 : Essayer par ID généré complet
    if (!buttonFound) {
      try {
        console.log("Testing strategy 4: Generated ID '#${id}'");
        await page.waitForSelector('#${id}', { timeout: 1000, visible: true });
        button = await page.$('#${id}');
        if (button) {
          buttonFound = true;
          strategyUsed = "generated ID";
          console.log("✅ Strategy 4 SUCCESS: Found button by generated ID");
        }
      } catch (error) {
        console.log("❌ Strategy 4 FAILED: " + error.message);
      }
    }
    
    // ✅ STRATÉGIE 5 : Dernier recours - recherche approximative
    if (!buttonFound) {
      try {
        console.log("Testing strategy 5: Approximate text matching (last resort)");
        const allButtons = await page.$$('button');
        console.log(\`Found \${allButtons.length} buttons on page, checking text...\`);
        
        for (let i = 0; i < allButtons.length; i++) {
          const btn = allButtons[i];
          try {
            const isEnabled = await btn.evaluate(el => !el.disabled);
            const isVisible = await btn.evaluate(el => el.offsetParent !== null);
            
            if (isEnabled && isVisible) {
              const btnText = await btn.evaluate(el => el.textContent || el.getAttribute('textContent') || '');
              console.log(\`Button \${i + 1}: "\${btnText.trim()}" (enabled: \${isEnabled}, visible: \${isVisible})\`);
              
              ${buttonText ? `
              // Vérifier si le texte correspond approximativement
              if (btnText.toLowerCase().includes("${buttonText.toLowerCase()}") || 
                  btnText.toLowerCase().includes("submit") || 
                  btnText.toLowerCase().includes("sign")) {
                button = btn;
                buttonFound = true;
                strategyUsed = \`approximate text match: '\${btnText.trim()}'\`;
                console.log(\`✅ Strategy 5 SUCCESS: Found button by approximate text: '\${btnText.trim()}'\`);
                break;
              }
              ` : `
              // Recherche générique pour mots-clés communs
              if (btnText.toLowerCase().includes("submit") || 
                  btnText.toLowerCase().includes("sign") || 
                  btnText.toLowerCase().includes("send") ||
                  btnText.toLowerCase().includes("create")) {
                button = btn;
                buttonFound = true;
                strategyUsed = \`generic text: '\${btnText.trim()}'\`;
                console.log(\`✅ Strategy 5 SUCCESS: Found button by generic text: '\${btnText.trim()}'\`);
                break;
              }
              `}
            }
          } catch (error) {
            console.log(\`Error checking button \${i + 1}: \${error.message}\`);
            continue;
          }
        }
        
        if (!buttonFound) {
          console.log("❌ Strategy 5 FAILED: No suitable button found");
        }
      } catch (error) {
        console.log("❌ Strategy 5 FAILED: " + error.message);
      }
    }
    
    // Clic final avec vérification
    if (button && buttonFound) {
      console.log(\`Attempting to click button using strategy: \${strategyUsed}\`);
      
      // Double vérification avant clic
      const isClickable = await button.evaluate(el => {
        return !el.disabled && el.offsetParent !== null;
      });
      
      if (isClickable) {
        await button.evaluate(el => el.scrollIntoView(true));
        await delay(500);
        await button.click();
        console.log("✅ CLICK SUCCESS: Clicked button '${id}' using " + strategyUsed);
      } else {
        console.log("❌ CLICK FAILED: Button found but not clickable (disabled or hidden)");
      }
    } else {
      console.log("❌ ALL STRATEGIES FAILED: Could not find button '${id}'");
      console.log("Expected text: ${buttonText || 'unknown'}");
      console.log("Tried strategies: case-insensitive text, submit with keywords, submit fallback, generated ID, approximate matching");
    }

  } catch (error) {
    console.log("❌ CRITICAL ERROR clicking button '${id}': " + error.message);
  }
`;
}

  /**
   * Détermine si un bouton doit être cliqué selon sa valeur
   */
  private shouldClickButton(value: any): boolean {
    const clickValues = ["clicked", "click", "true", "submit", "press", "activate", true, 1, "1"];
    const noClickValues = ["not-clicked", "no-click", "false", "skip", "ignore", false, 0, "0"];

    if (value === null || value === undefined) return true; // Par défaut, cliquer

    const valueStr = String(value).toLowerCase().trim();

    if (noClickValues.includes(valueStr) || noClickValues.includes(value)) {
      return false;
    }

    if (clickValues.includes(valueStr) || clickValues.includes(value)) {
      return true;
    }

    return true;
  }

  /**
   * Extrait les mots-clés de l'ID de bouton pour la correspondance
   */
  private extractKeywordsFromId(id: string): string[] {
    if (!id || typeof id !== 'string') return [];
    const parts = id.split('__');
    if (parts.length >= 3 && parts[0] === 'button') {
      const stablePart = parts[1];
      return stablePart.split('_').map(word => word.toLowerCase().trim()).filter(word => word.length > 0);
    }
    return [];
  }

  /**
   * Extrait la partie stable d'un ID de bouton (pour fallback)
   */
  private extractStableButtonText(id: string): string {
    if (!id || typeof id !== 'string') return '';
    const parts = id.split('__');
    if (parts.length >= 3 && parts[0] === 'button') {
      return parts[1];
    }
    return '';
  }

  private generateFileUploadCode(id: string, value: any, waitTimeout: number): string {
    const isFakePath = value && (typeof value === 'string' && (value.includes('fakepath') || value.includes('C:\\')));
    const safeValue = isFakePath ? 'FILE_PATH_HERE' : (value || 'FILE_PATH_HERE');

    return `
  try {
    await page.waitForSelector('#${id}', { timeout: ${waitTimeout} });
    
    // TODO: Replace 'FILE_PATH_HERE' with the actual path to your file
    // Example: "/home/user/documents/test_file.jpg" or "C:\\\\Users\\\\User\\\\Documents\\\\test_file.jpg"
    const filePath = "${safeValue}";
    
    // Always skip if it's a placeholder or fake path
    if (filePath === "FILE_PATH_HERE" || filePath.includes("fakepath")) {
      console.log("⚠️ WARNING: File upload detected but no valid file path provided!");
      console.log(\` Original value: '${value}'\`);
      console.log(" Please replace with actual file path before running this test.");
      console.log(" Example: const filePath = '/home/user/documents/your_file.jpg'");
      console.log(\` Skipping file upload for '${id}'\`);
    } else {
      // Only execute if we have a real, valid file path
      const fileInput = await page.$('#${id}');
      await fileInput.uploadFile(filePath);
      console.log(\`Uploaded file '\${filePath}' for input '${id}'\`);
    }
  } catch (error) {
    console.log("Warning: Could not find file input with ID '${id}'");
  }
`;
  }
}
