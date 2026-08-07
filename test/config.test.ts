import { describe, it, expect, vi, beforeEach } from "vitest";
import { getConfig, resolveConfig, resetConfig } from "../src/config";
import { loadConfig } from "c12";
import memoryDriver from "unstorage/drivers/memory";
import type { OmnichronConfig } from "../src/config";

// Mock loadConfig to avoid file system dependency in tests
vi.mock("c12", () => ({
  loadConfig: vi.fn(),
}));

describe("Config", () => {
  const mockedLoadConfig = loadConfig as unknown as ReturnType<typeof vi.fn>;

  // Default mock response for loadConfig
  const defaultMockConfig: OmnichronConfig = {
    storage: {
      driver: memoryDriver(),
      cache: true,
      ttl: 604800000, // 7 days
      prefix: "test-prefix",
    },
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
      expect.objectContaining({
        name: "omnichron",
        defaults: expect.any(Object),
        envName: expect.any(String),
        rcFile: ".omnichron",
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
  ])("should isolate explicit %s options from the default cache", async (_name, load) => {
    const firstConfig: OmnichronConfig = {
      ...defaultMockConfig,
      storage: {
        ...defaultMockConfig.storage,
        prefix: "first-prefix",
      },
    };
    const secondConfig: OmnichronConfig = {
      ...defaultMockConfig,
      storage: {
        ...defaultMockConfig.storage,
        prefix: "second-prefix",
      },
    };
    mockedLoadConfig
      .mockResolvedValueOnce({ config: firstConfig })
      .mockResolvedValueOnce({ config: secondConfig })
      .mockResolvedValueOnce({ config: { ...defaultMockConfig } });

    const first = await load({ cwd: "/first/path" });
    const second = await load({ cwd: "/second/path" });
    const defaultConfig = await load();
    const cachedDefaultConfig = await load();

    expect(first.storage.prefix).toBe("first-prefix");
    expect(second.storage.prefix).toBe("second-prefix");
    expect(defaultConfig.storage.prefix).toBe("test-prefix");
    expect(cachedDefaultConfig.storage.prefix).toBe("test-prefix");
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
        storage: { prefix: "custom-prefix" },
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
      expect.objectContaining({
        name: "omnichron",
        defaults: expect.any(Object),
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
      expect.objectContaining({
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
        // Missing storage
        performance: {
          concurrency: 5,
        },
      },
    });

    // Act
    const config = await getConfig();

    // Assert
    expect(config.storage).toBeDefined();
    expect(config.storage.prefix).toBe("omnichron"); // Default prefix
  });
});
