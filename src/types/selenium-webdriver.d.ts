// 类型声明 — selenium-webdriver（可选依赖，仅 ECS 部署时需要）

declare module 'selenium-webdriver' {
  export class Builder {
    forBrowser(browser: string): Builder;
    setChromeOptions(opts: unknown): Builder;
    setChromeService(service: unknown): Builder;
    build(): Promise<WebDriver>;
  }
  export class By {
    static css(selector: string): unknown;
    static xpath(xpath: string): unknown;
  }
  export const until: {
    elementLocated(locator: unknown): unknown;
  };
  export interface WebDriver {
    get(url: string): Promise<void>;
    sleep(ms: number): Promise<void>;
    findElement(locator: unknown): Promise<WebElement>;
    findElements(locator: unknown): Promise<WebElement[]>;
    executeScript(script: string, ...args: unknown[]): Promise<unknown>;
    wait(condition: unknown, timeout?: number): Promise<unknown>;
    quit(): Promise<void>;
    manage(): { setTimeouts(o: Record<string, number>): Promise<void> };
  }
  export interface WebElement {
    sendKeys(text: string): Promise<void>;
    click(): Promise<void>;
    clear(): Promise<void>;
    getAttribute(name: string): Promise<string>;
    isDisplayed(): Promise<boolean>;
    getText(): Promise<string>;
  }
}

declare module 'selenium-webdriver/chrome' {
  export class Options {
    pageLoadStrategy: string;
    addArguments(...args: string[]): void;
  }
  export class ServiceBuilder {
    constructor(path?: string);
  }
}
