import { anyValue, objectContaining } from "./_matchers";
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import * as archives from "../src";
import { getConfig, resolveConfig, resetConfig, setConfig, setConfigCwd } from "../src/config";
import { discoverConfig } from "../src/config-discovery.browser";
import { loadConfig } from "c12";
import type { ArchivesConfig } from "../src/config";

// Mock loadConfig to avoid file system dependency in tests
vi.mock("c12", () => ({
  loadConfig: vi.fn(),
}));

describe("Config", () => {
  const mockedLoadConfig = loadConfig as unknown as ReturnType<typeof vi.fn>;

  // Default mock response for loadConfig
  const defaultMockConfig: ArchivesConfig = {
    performance: {
      concurrency: 5,
      batchSize: 30,
      timeout: 15000,
      retries: 3,
    },
  };

  beforeEach(() => {
    resetConfig();
    // Reset mock and set default return
    mockedLoadConfig.mockReset();
    mockedLoadConfig.mockResolvedValue({ config: { ...defaultMockConfig } });
  });

  it("should load config with default options", async () => {
    // Act
    const config = await getConfig();

    // Assert
    expect(config).toEqual(defaultMockConfig);
    expect(mockedLoadConfig).toHaveBeenCalledWith(
      objectContaining({
        name: "archives",
        defaults: anyValue(Object),
        envName: anyValue(String),
        rcFile: ".archives",
        packageJson: true,
      }),
    );
  });

  it("should return cached config without calling loadConfig again", async () => {
    // Arrange
    await getConfig(); // First call - should load
    mockedLoadConfig.mockClear();

    // Act
    const config = await getConfig(); // Second call - should use cache

    // Assert
    expect(config).toEqual(defaultMockConfig);
    expect(mockedLoadConfig).not.toHaveBeenCalled();
  });

  it.each([
    ["resolveConfig", resolveConfig],
    ["getConfig", getConfig],
  ])("should reuse default cache for undefined %s options", async (_name, load) => {
    await load();
    mockedLoadConfig.mockClear();

    const config = await load({ cwd: undefined, envName: undefined });

    expect(config).toEqual(defaultMockConfig);
    expect(mockedLoadConfig).not.toHaveBeenCalled();
  });

  it.each([
    ["resolveConfig", resolveConfig],
    ["getConfig", getConfig],
  ])("should isolate explicit %s options from the default cache", async (_name, load) => {
    const firstConfig: ArchivesConfig = {
      performance: { ...defaultMockConfig.performance, retries: 6 },
    };
    const secondConfig: ArchivesConfig = {
      performance: { ...defaultMockConfig.performance, retries: 7 },
    };
    mockedLoadConfig
      .mockResolvedValueOnce({ config: firstConfig })
      .mockResolvedValueOnce({ config: secondConfig })
      .mockResolvedValueOnce({ config: { ...defaultMockConfig } });

    const first = await load({ cwd: "/first/path" });
    const second = await load({ cwd: "/second/path" });
    const defaultConfig = await load();
    const cachedDefaultConfig = await load();

    expect(first.performance.retries).toBe(6);
    expect(second.performance.retries).toBe(7);
    expect(defaultConfig.performance.retries).toBe(3);
    expect(cachedDefaultConfig.performance.retries).toBe(3);
    expect(mockedLoadConfig).toHaveBeenCalledTimes(3);
  });

  it("should reset config cache", async () => {
    // Arrange
    await getConfig(); // Cache the configuration
    resetConfig(); // Reset cache
    mockedLoadConfig.mockClear();

    // Act
    await getConfig(); // Should load again

    // Assert
    expect(mockedLoadConfig).toHaveBeenCalled();
  });

  it("should pass custom options to loadConfig", async () => {
    // Arrange
    const customOptions = {
      cwd: "/custom/path",
      defaults: {
        performance: { retries: 2 },
      },
      overrides: {
        performance: { concurrency: 10 },
      },
      envName: "production",
      configFile: "custom.config.ts",
      rcFile: ".customrc",
    };

    // Act
    await resolveConfig(customOptions);

    // Assert
    expect(mockedLoadConfig).toHaveBeenCalledWith(
      objectContaining({
        name: "archives",
        defaults: anyValue(Object),
        envName: "production",
        cwd: "/custom/path",
        configFile: "custom.config.ts",
        rcFile: ".customrc",
        packageJson: true,
      }),
    );
  });

  it("should use NODE_ENV as default envName if not specified", async () => {
    // Arrange
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";

    // Act
    await resolveConfig({});

    // Assert
    expect(mockedLoadConfig).toHaveBeenCalledWith(
      objectContaining({
        envName: "test",
      }),
    );

    // Cleanup
    process.env.NODE_ENV = originalEnv;
  });

  it("should apply post-processing to fix missing properties", async () => {
    // Arrange
    mockedLoadConfig.mockResolvedValue({
      config: {
        performance: {
          concurrency: 5,
        },
      },
    });

    // Act
    const config = await getConfig();

    // Assert
    expect(config.performance).toEqual({
      concurrency: 5,
      batchSize: 20,
      timeout: 10000,
      retries: 1,
    });
  });

  describe("setConfig", () => {
    it("answers getConfig without loading c12", async () => {
      setConfig({ performance: { timeout: 2000 } });

      const config = await getConfig();

      expect(mockedLoadConfig).not.toHaveBeenCalled();
      expect(config.performance).toEqual({
        concurrency: 3,
        batchSize: 20,
        timeout: 2000,
        retries: 1,
      });
    });

    it("gives way to discovery after resetConfig or setConfigCwd", async () => {
      setConfig();
      resetConfig();
      await getConfig();
      expect(mockedLoadConfig).toHaveBeenCalledTimes(1);

      setConfig();
      setConfigCwd("/home/someone");
      try {
        await getConfig();
        expect(mockedLoadConfig).toHaveBeenCalledTimes(2);
        expect(mockedLoadConfig).toHaveBeenLastCalledWith(
          objectContaining({ cwd: "/home/someone" }),
        );
      } finally {
        setConfigCwd(process.cwd());
      }
    });

    it("outlasts a discovery that was already running", async () => {
      let finish: (value: unknown) => void = () => undefined;
      mockedLoadConfig.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );

      const running = getConfig();
      await Promise.resolve();
      setConfig({ performance: { retries: 4 } });
      finish({ config: { ...defaultMockConfig } });
      await running;

      expect((await getConfig()).performance.retries).toBe(4);
    });

    it("leaves an explicit resolveConfig call to c12", async () => {
      setConfig();

      await resolveConfig({ cwd: "/custom/path" });

      expect(mockedLoadConfig).toHaveBeenCalledTimes(1);
    });
  });

  it("exports every config function from the package entry", () => {
    expect(archives).toMatchObject({
      getConfig,
      resolveConfig,
      resetConfig,
      setConfig,
      setConfigCwd,
    });
  });

  describe("discovery for browsers and Workers", () => {
    it("merges the layers it was given and never reaches for c12", async () => {
      const config = await discoverConfig(
        {
          cwd: "/nowhere",
          overrides: { performance: { timeout: 2000, retries: undefined } },
          defaults: { performance: { retries: 4 } },
        },
        defaultMockConfig,
      );

      expect(mockedLoadConfig).not.toHaveBeenCalled();
      expect(config).toEqual({
        performance: { ...defaultMockConfig.performance, timeout: 2000, retries: 4 },
      });
    });
  });
});
