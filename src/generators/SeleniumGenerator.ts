import { TestScriptGenerator, TestGenerationOptions } from './TestScriptGenerator.js';
import * as fs from 'fs';
import * as path from 'path';

export class SeleniumGenerator extends TestScriptGenerator {
  getSupportedType(): string {
    return 'selenium';
  }

  getFileExtension(): string {
    return '.py';
  }

  private indent(code: string, level: number = 1): string {
    const prefix = '    '.repeat(level); // 4 espaces
    return code.split('\n').map(line => line ? prefix + line : '').join('\n');
  }

  /**
   * Génère un script Selenium Python à partir d'un scénario généralisé
   */
  async generateScript(): Promise<string> {
    const waitTimeout = this.options.waitTimeout || 20;
    const baseUrl = this.options.baseUrl || "http://localhost:4200";
    const scenario = this.options.formData;

    // Génère le code Python pour chaque test/scénario
    let testsCode = '';
    for (const [testIdx, test] of scenario.entries()) {
      const route = test.route || '/';
      const steps = test.scenario || test.childs || [];
      const testFnName = `test_case_${testIdx + 1}`;
      testsCode += this.generateTestFunction(testFnName, route, steps, waitTimeout, baseUrl);
      testsCode += '\n\n';
    }

    // En-tête du script avec instructions
    const template = `
"""
Selenium Test Script - Generated Automatically
==============================================

⚠️ IMPORTANT: Before running this script, please:
1. Make sure Chrome browser and ChromeDriver are installed
2. Update the 'chrome_driver_path' variable with your actual ChromeDriver path
3. Replace any 'FILE_PATH_HERE' with actual file paths for file uploads
4. Verify that the base URL ('${baseUrl}') is correct for your application
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException
import time

BASE_URL = "${baseUrl}"
WAIT_TIMEOUT = ${waitTimeout}

def setup_driver():
    options = Options()
    options.add_experimental_option("detach", True)
    # TODO: Update this path to match your ChromeDriver installation
    chrome_driver_path = "/usr/bin/chromedriver"  # Linux/Mac
    # chrome_driver_path = "C:\\\\path\\\\to\\\\chromedriver.exe"  # Windows
    service = Service(executable_path=chrome_driver_path)
    driver = webdriver.Chrome(service=service, options=options)
    return driver

${testsCode}

if __name__ == "__main__":
    driver = setup_driver()
    try:
${(scenario as any[]).map((_: any, i: number) => `        test_case_${i + 1}(driver)`).join('\n')}
    finally:
        # driver.quit()  # Uncomment to close browser after tests
        print("All tests completed.")
`;

    return template;
  }

  /**
   * Génère le code d'une fonction de test pour un scénario donné
   */
  private generateTestFunction(fnName: string, route: string, steps: any[], waitTimeout: number, baseUrl: string): string {
    let code = `def ${fnName}(driver):\n`;
    code += `    print("Running ${fnName} on route ${route}")\n`;
    code += `    driver.get(f"{BASE_URL}${route}")\n`;
    code += `    time.sleep(1)\n`;

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
          code += `    # [WARN] Type '${type}' not handled for id '${id}'\n`;
      }
    }

    code += `    print("Test '${fnName}' completed.")\n`;
    return code;
  }

  private generateInputCode(id: string, value: any, waitTimeout: number): string {
    return `
    try:
        element = WebDriverWait(driver, ${waitTimeout}).until(
            EC.presence_of_element_located((By.ID, "${id}"))
        )
        element.clear()
        element.send_keys("${value}")
        print("Filled input '${id}' with value '${value}'")
    except TimeoutException:
        print("Warning: Could not find input with ID '${id}'")
`;
  }

  private generateRadioGroupCode(id: string, value: any, waitTimeout: number): string {
    // Extrait la partie stable (ex: "gender" depuis "mat-radio-group__gender__uuid")
    const stablePart = this.extractStableRadioGroupName(id);
    return `
    try:
        radio_selected = False
        # Stratégie 1: Cherche par ID stable + valeur (ex: "genderM" pour value="M")
        if "${stablePart}" and "${value}":
            try:
                # Construit l'ID probable : nom du groupe + première lettre de la valeur
                probable_id = "${stablePart}" + "${value}".upper()
                radio = WebDriverWait(driver, 2).until(
                    EC.element_to_be_clickable((By.ID, probable_id))
                )
                radio.click()
                radio_selected = True
                print(f"Selected radio '${stablePart}' with value '${value}' by probable ID: {probable_id}")
            except TimeoutException:
                pass

        # Stratégie 2: Cherche par name du groupe + valeur
        if not radio_selected and "${stablePart}" and "${value}":
            try:
                radio = WebDriverWait(driver, 2).until(
                    EC.element_to_be_clickable((By.XPATH, f"//input[@type='radio'][@name='${stablePart}'][@value='${value}']"))
                )
                radio.click()
                radio_selected = True
                print(f"Selected radio '${stablePart}' with value '${value}' by name and value")
            except TimeoutException:
                pass

        # Stratégie 3: Cherche dans le groupe mat-radio-group par valeur
        if not radio_selected and "${value}":
            try:
                # Trouve le mat-radio-group puis le bouton avec la bonne valeur
                radio_group = WebDriverWait(driver, 2).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "mat-radio-group"))
                )
                radio = radio_group.find_element(By.XPATH, f".//mat-radio-button[@value='${value}']")
                radio.click()
                radio_selected = True
                print(f"Selected radio with value '${value}' in mat-radio-group")
            except TimeoutException:
                pass

        # Stratégie 4: Cherche par texte du bouton (si la valeur correspond au texte)
        if not radio_selected and "${value}":
            try:
                # Cherche un mat-radio-button contenant le texte
                radio = WebDriverWait(driver, 2).until(
                    EC.element_to_be_clickable((By.XPATH, f"//mat-radio-button[contains(., '${value}')]"))
                )
                radio.click()
                radio_selected = True
                print(f"Selected radio by text matching: '${value}'")
            except TimeoutException:
                pass

        # Stratégie 5: Fallback - cherche par partie stable de l'ID original
        if not radio_selected and "${stablePart}":
            try:
                # Trouve tous les boutons radio avec un ID contenant la partie stable
                radios = driver.find_elements(By.CSS_SELECTOR, f"[id*='${stablePart}']")
                for radio in radios:
                    if radio.get_attribute('type') == 'radio' or radio.tag_name == 'mat-radio-button':
                        radio_value = radio.get_attribute('value') or ''
                        if "${value}".lower() in radio_value.lower():
                            radio.click()
                            radio_selected = True
                            print(f"Selected radio by ID pattern and value matching")
                            break
            except Exception:
                pass

        if not radio_selected:
            print("Warning: Could not select radio button for group '${id}' with value '${value}'")
            print("Tried strategies: probable ID, name+value, mat-radio-group, text matching, ID pattern")

    except Exception as e:
        print(f"Error selecting radio button '${id}': {str(e)}")
`;
  }

  /**
   * Extrait le nom stable d'un groupe de boutons radio
   * Ex: "mat-radio-group__gender__uuid" -> "gender"
   */
  private extractStableRadioGroupName(id: string): string {
    if (!id || typeof id !== 'string') return '';
    const parts = id.split('__');
    if (parts.length >= 3 && parts[0] === 'mat-radio-group') {
      return parts[1]; // Retourne "gender", "payment", etc.
    }
    return '';
  }

  private generateMatSelectCode(id: string, value: any, waitTimeout: number): string {
    // Extrait la partie stable - gère les cas simples comme "country" ET les patterns complets
    const stablePart = this.extractStableSelectName(id);
    return `
    try:
        option_selected = False
        # Stratégie 1: Cherche mat-select par ID exact
        try:
            mat_select = WebDriverWait(driver, ${waitTimeout}).until(
                EC.element_to_be_clickable((By.ID, "${id}"))
            )
            # Clique pour ouvrir le dropdown
            mat_select.click()
            time.sleep(1.0)  # Délai plus long pour l'ouverture
            # Attendre que le panel de dropdown apparaisse
            WebDriverWait(driver, 8).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, ".mat-select-panel, .mat-mdc-select-panel, mat-select-panel"))
            )

            # Stratégie A: JavaScript click direct (évite l'overlay)
            try:
                option = WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.XPATH, "//mat-option[@value='${value}' or contains(text(), '${value}')]"))
                )
                driver.execute_script("arguments[0].click();", option)
                option_selected = True
                print("Selected option '${value}' in mat-select '${id}' by exact ID (JS click)")
            except TimeoutException:
                # Stratégie B: Ferme l'overlay d'abord, puis clique
                try:
                    # Clique sur l'overlay pour le fermer
                    overlay = driver.find_element(By.CSS_SELECTOR, ".cdk-overlay-backdrop")
                    driver.execute_script("arguments[0].click();", overlay)
                    time.sleep(0.3)
                    # Rouvre le select
                    mat_select.click()
                    time.sleep(0.8)
                    # Essaie de cliquer sur l'option
                    option = WebDriverWait(driver, 5).until(
                        EC.element_to_be_clickable((By.XPATH, "//mat-option[contains(text(), '${value}')]"))
                    )
                    option.click()
                    option_selected = True
                    print("Selected option '${value}' after closing overlay")
                except Exception:
                    pass
        except TimeoutException:
            pass

        # Stratégie 2: Cherche mat-select par formControlName (très commun)
        if not option_selected:
            try:
                # Utilise l'ID comme formControlName si pas de pattern spécial
                control_name = "${stablePart}" if "${stablePart}" else "${id}"
                mat_select = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, f"mat-select[formcontrolname='{control_name}']"))
                )
                mat_select.click()
                time.sleep(0.8)
                WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, ".mat-select-panel, .mat-mdc-select-panel"))
                )
                option = WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.XPATH, "//mat-option[@value='${value}' or contains(text(), '${value}')]"))
                )
                driver.execute_script("arguments[0].click();", option)
                option_selected = True
                print("Selected option '${value}' in mat-select by formControlName (JS click)")
            except TimeoutException:
                pass

        # Stratégie 3: Approche par actions pour éviter l'overlay
        if not option_selected:
            try:
                from selenium.webdriver.common.action_chains import ActionChains
                mat_select = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.ID, "${id}"))
                )
                # Utilise ActionChains pour un clic plus précis
                actions = ActionChains(driver)
                actions.move_to_element(mat_select).click().perform()
                time.sleep(0.8)
                # Cherche directement l'option visible
                option = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.XPATH, "//mat-option[contains(text(), '${value}')]"))
                )
                actions.move_to_element(option).click().perform()
                option_selected = True
                print("Selected option '${value}' using ActionChains")
            except Exception:
                pass

        # Stratégie 4: Force click par coordonnées (dernier recours)
        if not option_selected:
            try:
                mat_select = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.ID, "${id}"))
                )
                # Force click avec JavaScript
                driver.execute_script("arguments[0].scrollIntoView(true);", mat_select)
                driver.execute_script("arguments[0].click();", mat_select)
                time.sleep(1.0)
                # Cherche toutes les options et clique sur la bonne
                options = WebDriverWait(driver, 5).until(
                    EC.presence_of_all_elements_located((By.CSS_SELECTOR, "mat-option"))
                )
                for opt in options:
                    opt_text = opt.text or opt.get_attribute('textContent') or ''
                    if "${value}" in opt_text:
                        driver.execute_script("arguments[0].click();", opt)
                        option_selected = True
                        print("Selected option '${value}' by force click")
                        break
            except Exception:
                pass

        if not option_selected:
            print("Warning: Could not select option '${value}' in mat-select '${id}'")
            print("Tried strategies: exact ID (JS), formControlName, ActionChains, force click")

    except Exception as e:
        print(f"Error selecting option in mat-select '${id}': {str(e)}")
`;
  }

  /**
   * Extrait le nom stable d'un mat-select - gère les IDs simples ET les patterns complets
   */
  private extractStableSelectName(id: string): string {
    if (!id || typeof id !== 'string') return '';
    const parts = id.split('__');
    if (parts.length >= 3 && parts[0] === 'mat-select') {
      return parts[1]; // Pattern: "mat-select__country__uuid" -> "country"
    }
    // Si c'est un ID simple comme "country", le retourne tel quel
    return id;
  }

  private generateButtonToggleGroupCode(id: string, value: any, waitTimeout: number): string {
    const stablePart = this.extractStableToggleGroupName(id);
    return `
    try:
        toggle_selected = False
        # Stratégie 1: Cherche mat-button-toggle-group par ID exact puis l'option
        try:
            toggle_group = WebDriverWait(driver, ${waitTimeout}).until(
                EC.presence_of_element_located((By.ID, "${id}"))
            )
            # Cherche le bouton toggle avec la valeur exacte
            toggle_button = toggle_group.find_element(By.XPATH, f".//mat-button-toggle[@value='{value}']")
            toggle_button.click()
            toggle_selected = True
            print("Selected button toggle '${value}' in group '${id}' by exact ID")
        except Exception:
            pass

        # Stratégie 2: Cherche mat-button-toggle-group par formControlName
        if not toggle_selected and "${stablePart}":
            try:
                toggle_group = WebDriverWait(driver, 3).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, f"mat-button-toggle-group[formcontrolname='{stablePart}']"))
                )
                # Cherche le bouton toggle avec la valeur exacte
                toggle_button = toggle_group.find_element(By.XPATH, f".//mat-button-toggle[@value='{value}']")
                toggle_button.click()
                toggle_selected = True
                print("Selected button toggle '${value}' by formControlName '${stablePart}'")
            except Exception:
                pass

        # Stratégie 3: Cherche par partie stable de l'ID
        if not toggle_selected and "${stablePart}":
            try:
                toggle_group = WebDriverWait(driver, 3).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, f"[id*='{stablePart}']"))
                )
                toggle_button = toggle_group.find_element(By.XPATH, f".//mat-button-toggle[@value='{value}']")
                toggle_button.click()
                toggle_selected = True
                print("Selected button toggle '${value}' by stable ID pattern")
            except Exception:
                pass

        # Stratégie 4: Cherche par texte du bouton (ex: "75%" pour value="75")
        if not toggle_selected:
            try:
                # Essaie de trouver un bouton toggle contenant la valeur dans le texte
                possible_texts = ["${value}", "${value}%", "Level ${value}", "${value} %"]
                for text in possible_texts:
                    try:
                        toggle_button = WebDriverWait(driver, 2).until(
                            EC.element_to_be_clickable((By.XPATH, f"//mat-button-toggle[contains(., '{text}')]"))
                        )
                        toggle_button.click()
                        toggle_selected = True
                        print(f"Selected button toggle by text matching: '{text}'")
                        break
                    except TimeoutException:
                        continue
            except Exception:
                pass

        # Stratégie 5: Cherche dans le premier groupe mat-button-toggle-group
        if not toggle_selected:
            try:
                toggle_group = WebDriverWait(driver, 3).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "mat-button-toggle-group"))
                )
                # Cherche par valeur d'abord
                try:
                    toggle_button = toggle_group.find_element(By.XPATH, f".//mat-button-toggle[@value='{value}']")
                    toggle_button.click()
                    toggle_selected = True
                    print("Selected button toggle '${value}' in first group found")
                except Exception:
                    # Si pas trouvé par valeur, cherche par texte
                    toggle_buttons = toggle_group.find_elements(By.CSS_SELECTOR, "mat-button-toggle")
                    for btn in toggle_buttons:
                        btn_text = btn.text or btn.get_attribute('textContent') or ''
                        if "${value}" in btn_text:
                            btn.click()
                            toggle_selected = True
                            print("Selected button toggle '${value}' by text in first group")
                            break
            except Exception:
                pass

        # Stratégie 6: Force click avec JavaScript (dernier recours)
        if not toggle_selected:
            try:
                toggle_button = WebDriverWait(driver, 3).until(
                    EC.presence_of_element_located((By.XPATH, f"//mat-button-toggle[@value='{value}' or contains(., '{value}')]"))
                )
                driver.execute_script("arguments[0].click();", toggle_button)
                toggle_selected = True
                print("Selected button toggle '${value}' by JavaScript click")
            except Exception:
                pass

        if not toggle_selected:
            print("Warning: Could not select button toggle '${value}' in group '${id}'")
            print("Tried strategies: exact ID, formControlName, stable ID, text matching, first group, JS click")

    except Exception as e:
        print(f"Error selecting button toggle '${id}': {str(e)}")
`;
  }

  /**
   * Extrait le nom stable d'un groupe de boutons toggle
   */
  private extractStableToggleGroupName(id: string): string {
    if (!id || typeof id !== 'string') return '';
    const parts = id.split('__');
    if (parts.length >= 3 && parts[0] === 'mat-button-toggle-group') {
      return parts[1]; // Retourne "agreementLevel", "preferences", etc.
    }
    // Si c'est un ID simple, le retourne tel quel
    return id;
  }

  private generateMatCheckboxCode(id: string, value: any, waitTimeout: number): string {
    const targetState = this.convertToPythonBoolean(value);
    const stablePart = this.extractStableCheckboxName(id);
    return `
    try:
        checkbox_selected = False
        target_state = ${targetState}  # True pour coché, False pour décoché

        # Stratégie 1: Clique sur le LABEL du mat-checkbox (le plus efficace)
        try:
            # Cherche le label associé à la checkbox
            label = WebDriverWait(driver, ${waitTimeout}).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "mat-checkbox[id='${id}'] label.mat-checkbox-layout"))
            )
            # Vérifie l'état via l'input interne
            checkbox_input = driver.find_element(By.CSS_SELECTOR, "mat-checkbox[id='${id}'] input[type='checkbox']")
            current_state = checkbox_input.is_selected()
            if current_state != target_state:
                label.click()  # Clic normal sur le label
                checkbox_selected = True
                print(f"Set mat-checkbox '${id}' to {target_state} by clicking label")
            else:
                checkbox_selected = True
                print(f"Mat-checkbox '${id}' already in desired state: {target_state}")
        except Exception:
            pass

        # Stratégie 2: Clique directement sur l'input interne
        if not checkbox_selected:
            try:
                checkbox_input = WebDriverWait(driver, 3).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "mat-checkbox[id='${id}'] input[type='checkbox']"))
                )
                current_state = checkbox_input.is_selected()
                if current_state != target_state:
                    # Force le clic via JavaScript sur l'input
                    driver.execute_script("arguments[0].click();", checkbox_input)
                    checkbox_selected = True
                    print(f"Set mat-checkbox '${id}' to {target_state} by JS click on input")
                else:
                    checkbox_selected = True
                    print(f"Mat-checkbox '${id}' already in desired state via input")
            except Exception:
                pass

        # Stratégie 3: Utilise formControlName pour trouver et cliquer sur le label
        if not checkbox_selected and "${stablePart}":
            try:
                label = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, "mat-checkbox[formcontrolname='${stablePart}'] label"))
                )
                checkbox_input = driver.find_element(By.CSS_SELECTOR, "mat-checkbox[formcontrolname='${stablePart}'] input[type='checkbox']")
                current_state = checkbox_input.is_selected()
                if current_state != target_state:
                    label.click()
                    checkbox_selected = True
                    print(f"Set mat-checkbox to {target_state} by formControlName label click")
                else:
                    checkbox_selected = True
                    print(f"Mat-checkbox already in desired state via formControlName")
            except Exception:
                pass

        # Stratégie 4: Premier mat-checkbox de la page (dernier recours)
        if not checkbox_selected:
            try:
                mat_checkbox = WebDriverWait(driver, 3).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "mat-checkbox"))
                )
                # Clique sur le label à l'intérieur
                label = mat_checkbox.find_element(By.CSS_SELECTOR, "label.mat-checkbox-layout")
                checkbox_input = mat_checkbox.find_element(By.CSS_SELECTOR, "input[type='checkbox']")
                current_state = checkbox_input.is_selected()
                if current_state != target_state:
                    label.click()
                    checkbox_selected = True
                    print(f"Set first mat-checkbox to {target_state} by label click")
                else:
                    checkbox_selected = True
                    print(f"First mat-checkbox already in desired state")
            except Exception:
                pass

        # Stratégie 5: Dispatch d'événement (dernier recours)
        if not checkbox_selected:
            try:
                checkbox_input = WebDriverWait(driver, 3).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "mat-checkbox input[type='checkbox']"))
                )
                current_state = checkbox_input.is_selected()
                if current_state != target_state:
                    # Dispatch un événement change
                    driver.execute_script("""
                    var checkbox = arguments[0];
                    checkbox.checked = arguments[1];
                    var event = new Event('change', { bubbles: true });
                    checkbox.dispatchEvent(event);
                    """, checkbox_input, target_state)
                    checkbox_selected = True
                    print(f"Set mat-checkbox to {target_state} by dispatching change event")
                else:
                    checkbox_selected = True
                    print(f"Mat-checkbox already in desired state")
            except Exception:
                pass

        if not checkbox_selected:
            print("Warning: Could not find or set mat-checkbox '${id}' to {target_state}")
            print("Tried strategies: label click, input JS click, formControlName label, first checkbox, event dispatch")

    except Exception as e:
        print(f"Error handling mat-checkbox '${id}': {str(e)}")
`;
  }

  /**
   * Convertit une valeur JavaScript en booléen Python correct
   */
  private convertToPythonBoolean(value: any): string {
    // Gère différents formats de valeurs de checkbox
    if (value === true || value === "true" || value === "selected" || value === "checked" || value === 1 || value === "1") {
      return "True"; // Python boolean
    }
    return "False"; // Python boolean
  }

  /**
   * Extrait le nom stable d'un mat-checkbox
   */
  private extractStableCheckboxName(id: string): string {
    if (!id || typeof id !== 'string') return '';
    const parts = id.split('__');
    if (parts.length >= 3 && parts[0] === 'mat-checkbox') {
      return parts[1]; // Retourne "newsletter", "terms", etc.
    }
    return id; // Si c'est un ID simple, le retourne tel quel
  }

  private generateButtonCode(id: string, value: any, waitTimeout: number): string {
    // Extrait les mots-clés de l'ID
    const keywords = this.extractKeywordsFromId(id);
    const keywordsStr = keywords.join(', ');
    // Vérifie si le bouton doit être cliqué
    const shouldClick = this.shouldClickButton(value);

    if (!shouldClick) {
      return `
    # Button '${id}' is set to NOT be clicked (value: '${value}')
    print("Skipping button '${id}' - value indicates no click required")
`;
    }

    return `
    try:
        button = None
        # 1. Cherche par ID exact
        try:
            button = WebDriverWait(driver, 2).until(
                EC.element_to_be_clickable((By.ID, "${id}"))
            )
            print("Found button by exact ID")
        except TimeoutException:
            pass

        # 2. Cherche par correspondance de mots-clés
        if not button and [${keywords.map(k => `"${k}"`).join(', ')}]:
            try:
                # Récupère tous les boutons de la page
                all_buttons = driver.find_elements(By.TAG_NAME, "button")
                keywords = [${keywords.map(k => `"${k}"`).join(', ')}]
                for btn in all_buttons:
                    try:
                        # Récupère le texte du bouton (inclut les icônes et texte imbriqué)
                        btn_text = btn.get_attribute('textContent') or btn.text or ""
                        btn_words = [word.lower().strip() for word in btn_text.split() if word.strip()]
                        # Vérifie si tous les mots-clés sont présents
                        if all(keyword in btn_words for keyword in keywords):
                            if btn.is_enabled() and btn.is_displayed():
                                button = btn
                                print(f"Found button by keywords matching: '{btn_text.strip()}'")
                                break
                    except Exception:
                        continue
            except Exception:
                pass

        # 3. Cherche par partie stable de l'ID (fallback)
        if not button:
            try:
                stable_part = "${this.extractStableButtonText(id)}"
                if stable_part:
                    button = WebDriverWait(driver, 2).until(
                        EC.element_to_be_clickable((By.CSS_SELECTOR, f"[id*='{stable_part}']"))
                    )
                    print("Found button by stable ID part")
            except TimeoutException:
                pass

        # 4. Cherche par type submit
        if not button:
            try:
                button = WebDriverWait(driver, 2).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, "button[type='submit']"))
                )
                print("Found button by submit type")
            except TimeoutException:
                pass

        if button:
            driver.execute_script("arguments[0].scrollIntoView(true);", button)
            time.sleep(0.5)
            button.click()
            print("Clicked button '${id}' successfully")
        else:
            print("Warning: Could not find button with ID '${id}' using any strategy")
            print("Expected keywords: ${keywordsStr}")

    except Exception as e:
        print(f"Error clicking button '${id}': {str(e)}")
`;
  }

  /**
   * Détermine si un bouton doit être cliqué selon sa valeur
   */
  private shouldClickButton(value: any): boolean {
    // Valeurs qui indiquent qu'il faut cliquer
    const clickValues = ["clicked", "click", "true", "submit", "press", "activate", true, 1, "1"];
    // Valeurs qui indiquent qu'il ne faut PAS cliquer
    const noClickValues = ["not-clicked", "no-click", "false", "skip", "ignore", false, 0, "0"];

    if (value === null || value === undefined) return true; // Par défaut, cliquer

    const valueStr = String(value).toLowerCase().trim();

    // Si la valeur indique explicitement de ne pas cliquer
    if (noClickValues.includes(valueStr) || noClickValues.includes(value)) {
      return false;
    }

    // Si la valeur indique explicitement de cliquer
    if (clickValues.includes(valueStr) || clickValues.includes(value)) {
      return true;
    }

    // Par défaut, cliquer (pour compatibilité avec anciens scénarios)
    return true;
  }

  /**
   * Extrait les mots-clés de l'ID de bouton pour la correspondance
   * Ex: "button__publish_post__uuid" -> ["publish", "post"]
   */
  private extractKeywordsFromId(id: string): string[] {
    if (!id || typeof id !== 'string') return [];
    const parts = id.split('__');
    if (parts.length >= 3 && parts[0] === 'button') {
      const stablePart = parts[1]; // Ex: "publish_post"
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
      return parts[1]; // Retourne la partie "publish_post"
    }
    return '';
  }

  private generateFileUploadCode(id: string, value: any, waitTimeout: number): string {
    // Détecte les chemins fakepath (Windows fake paths)
    const isFakePath = value && (typeof value === 'string' && (value.includes('fakepath') || value.includes('C:\\')));
    const safeValue = isFakePath ? 'FILE_PATH_HERE' : (value || 'FILE_PATH_HERE');

    return `
    try:
        file_input = WebDriverWait(driver, ${waitTimeout}).until(
            EC.presence_of_element_located((By.ID, "${id}"))
        )
        # TODO: Replace 'FILE_PATH_HERE' with the actual path to your file
        # Example: "/home/user/documents/test_file.jpg" or "C:\\\\Users\\\\User\\\\Documents\\\\test_file.jpg"
        file_path = "${safeValue}"
        # Always skip if it's a placeholder or fake path
        if file_path == "FILE_PATH_HERE" or "fakepath" in file_path:
            print("⚠️ WARNING: File upload detected but no valid file path provided!")
            print(f" Original value: '${value}'")
            print(" Please replace with actual file path before running this test.")
            print(" Example: file_path = '/home/user/documents/your_file'")
            print(f" Skipping file upload for '${id}'")
        else:
            # Only execute if we have a real, valid file path
            file_input.send_keys(file_path)
            print(f"Uploaded file '{file_path}' for input '${id}'")

    except TimeoutException:
        print("Warning: Could not find file input with ID '${id}'")
    except Exception as e:
        print(f"Error uploading file for '${id}': {str(e)}")
`;
  }
}
