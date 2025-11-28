import { Browser, Builder, By, ThenableWebDriver, WebDriver } from "selenium-webdriver";
import { ExpectedResult, Scenario, ScenarioStepData } from "../models/scenarios/scenarios-info.js";
import { UserJourney, UserJourneyStep } from "../models/user-journeys/user-journey-info.js";
import path from "path";
import { UserJourneyExpandedStep } from "../models/user-journeys/user-journey-expanded-step.js";


export async function executeSelenium(scenario: Scenario, userJourney: UserJourney, url: string) {

    if (!userJourney.expandedSteps)
        throw new Error("userJourney.expandedSteps null or undifined");
    if (!scenario.expectedResult)
        throw new Error("scenario.expectedResult null or undifined");            
        
    const steps = userJourney.expandedSteps;
    const values = scenario.stepsData;
    const expectedResult = scenario.expectedResult;
    
    let driver: WebDriver | undefined;
    try {
        const route = path.join(url, userJourney.expandedSteps[0].target.id);

        driver = await new Builder().forBrowser(Browser.CHROME).build();

        await driver.get(route);
        
        await execute(steps, values, driver)
        
        const result = await checkExpectedResult(expectedResult, driver);

        await driver.close();

        return result;
    }
    catch (err: any) {
        await driver?.close();
        throw err;
    }
}

async function execute(steps: UserJourneyExpandedStep[], values: ScenarioStepData[], driver: WebDriver) {
    
    try {
        
        for (let i = 1; i < steps.length; i++) {
            const step = steps[i];
            if (step.target.type === "widget") {
                if (step.meta) {
                    const selector: string = step.meta["selectorHint"];

                    if (step.actionType === "input") {

                        const element = await driver.findElement(By.css(selector));

                        const type: string = await element.getAttribute("type");
                        await element.sendKeys(values[i].value);

                    }
                    else if (step.actionType === "submit") {
                        // submit : 
                        //      PROBLEM with the form because the widget of the form which
                        //      contains forms element is considered as "submit" but is
                        //      is not clickable like a submit button. It shall be determined
                        //      as something else or skipped durring execution
                        //      Also some of the submit action steps don't have a selector
                        //      to get the element
                    }
                    else if (step.actionType === "click") {
                        const element = await driver.findElement(By.css(selector));
                        await element.click();
                    }
                }
            }
        }
    } catch (err: any) {
        throw err;
    }
}

async function checkExpectedResult(expectedResult: ExpectedResult, driver: WebDriver) {

    const target = expectedResult.target;
    const match = expectedResult.match;

    const elementToCheck = await driver.findElement(By.css(String(target.selector)));
    if (!elementToCheck) {
        throw new Error(`No element matches the base selector for the result check:'${target.selector}}'`);
    }

    let valuesToCheck = "";
    // Check if one attribute of the selected base node match the expected value
    if (target.context === "attribute") {
        // TODO
        // Currently Selenium does not offer the possibility to get all attributes of one HTML node.
        // So, we cannot easily found one attribute into the full list. Manual script executed through the Selenium driver could achieve that.
    }
    // Check if the value of the class or id attribute match the expected value
    else if (target.context === "class" || target.context === "id") {
        valuesToCheck = await elementToCheck.getAttribute(target.context);
    }
    // check if the selected base node inner text match the specified value
    else if (target.context === "innerText") {
        valuesToCheck = await elementToCheck.getText();
    }
    // Check if one of the child element of the selected base node match the specified value
    else if (target.context === "tag") {
        const valuesToCheck = await elementToCheck.getTagName();
    }
    
    if (match.kind === "contains") {
        if (valuesToCheck.includes(match.value))
            return true;
        else
            throw new Error(`element selected by '${target.selector}', context: '${target.context}' does not contain value '${match.value}'. Actual values are '${valuesToCheck}'`);
    }
    else if (match.kind === "exact") {
        if (valuesToCheck === match.value)
            return true;
        else
            throw new Error(`element selected by '${target.selector}', context: '${target.context}' is not equal to value '${match.value}'. Actual values are '${valuesToCheck}'`);
    }
    if (match.kind === "pattern") {
        const regex = new RegExp(match.value);
        if (regex.test(valuesToCheck))
            return true;
        else
            throw new Error(`element selected by '${target.selector}', context: '${target.context}' does not include pattern '${match.value}'. Actual values are '${valuesToCheck}'`);
    }
}