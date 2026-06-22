import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConfigValidationService } from './config-validation.service';

describe('ConfigValidationService', () => {
  let service: ConfigValidationService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigValidationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ConfigValidationService>(ConfigValidationService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validate', () => {
    it('should pass validation with all required environment variables set', () => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        const envVars: Record<string, string> = {
          JWT_SECRET: 'a-very-secure-secret-key-that-is-at-least-32-chars',
          DB_PASSWORD: 'a-very-secure-db-password-16chars',
          NODE_ENV: 'development',
        };
        return envVars[key];
      });

      expect(() => service.validate()).not.toThrow();
    });

    it('should throw error when JWT_SECRET is missing', () => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        const envVars: Record<string, string> = {
          DB_PASSWORD: 'a-very-secure-db-password-16chars',
        };
        return envVars[key];
      });

      expect(() => service.validate()).toThrow(
        'Configuration validation failed',
      );
    });

    it('should throw error when DB_PASSWORD is missing', () => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        const envVars: Record<string, string> = {
          JWT_SECRET: 'a-very-secure-secret-key-that-is-at-least-32-chars',
        };
        return envVars[key];
      });

      expect(() => service.validate()).toThrow(
        'Configuration validation failed',
      );
    });

    it('should throw error when both JWT_SECRET and DB_PASSWORD are missing', () => {
      (configService.get as jest.Mock).mockReturnValue(undefined);

      expect(() => service.validate()).toThrow(
        'Configuration validation failed',
      );
    });

    describe('production mode validation', () => {
      it('should throw error in production with default JWT_SECRET', () => {
        (configService.get as jest.Mock).mockImplementation((key: string) => {
          const envVars: Record<string, string> = {
            JWT_SECRET: 'default-secret-change-in-production',
            DB_PASSWORD: 'a-very-secure-db-password-16chars',
            NODE_ENV: 'production',
          };
          return envVars[key];
        });

        expect(() => service.validate()).toThrow(
          'Production environment detected with weak or default secrets',
        );
      });

      it('should throw error in production with weak JWT_SECRET (less than 32 chars)', () => {
        (configService.get as jest.Mock).mockImplementation((key: string) => {
          const envVars: Record<string, string> = {
            JWT_SECRET: 'short-secret',
            DB_PASSWORD: 'a-very-secure-db-password-16chars',
            NODE_ENV: 'production',
          };
          return envVars[key];
        });

        expect(() => service.validate()).toThrow(
          'JWT_SECRET must be at least 32 characters long in production',
        );
      });

      it('should throw error in production with default DB_PASSWORD', () => {
        (configService.get as jest.Mock).mockImplementation((key: string) => {
          const envVars: Record<string, string> = {
            JWT_SECRET: 'a-very-secure-secret-key-that-is-at-least-32-chars',
            DB_PASSWORD: 'password',
            NODE_ENV: 'production',
          };
          return envVars[key];
        });

        expect(() => service.validate()).toThrow(
          'Production environment detected with weak or default secrets',
        );
      });

      it('should throw error in production with weak DB_PASSWORD (less than 16 chars)', () => {
        (configService.get as jest.Mock).mockImplementation((key: string) => {
          const envVars: Record<string, string> = {
            JWT_SECRET: 'a-very-secure-secret-key-that-is-at-least-32-chars',
            DB_PASSWORD: 'weakpass',
            NODE_ENV: 'production',
          };
          return envVars[key];
        });

        expect(() => service.validate()).toThrow(
          'DB_PASSWORD must be at least 16 characters long in production',
        );
      });

      it('should pass validation in production with strong secrets', () => {
        (configService.get as jest.Mock).mockImplementation((key: string) => {
          const envVars: Record<string, string> = {
            JWT_SECRET: 'a-very-secure-secret-key-that-is-at-least-32-chars',
            DB_PASSWORD: 'a-very-secure-db-password-16chars',
            NODE_ENV: 'production',
          };
          return envVars[key];
        });

        expect(() => service.validate()).not.toThrow();
      });

      it('should throw error in production with JWT_SECRET = "secret"', () => {
        (configService.get as jest.Mock).mockImplementation((key: string) => {
          const envVars: Record<string, string> = {
            JWT_SECRET: 'secret',
            DB_PASSWORD: 'a-very-secure-db-password-16chars',
            NODE_ENV: 'production',
          };
          return envVars[key];
        });

        expect(() => service.validate()).toThrow(
          'Production environment detected with weak or default secrets',
        );
      });

      it('should throw error in production with JWT_SECRET = "changeme"', () => {
        (configService.get as jest.Mock).mockImplementation((key: string) => {
          const envVars: Record<string, string> = {
            JWT_SECRET: 'changeme',
            DB_PASSWORD: 'a-very-secure-db-password-16chars',
            NODE_ENV: 'production',
          };
          return envVars[key];
        });

        expect(() => service.validate()).toThrow(
          'Production environment detected with weak or default secrets',
        );
      });

      it('should throw error in production with DB_PASSWORD = "secret"', () => {
        (configService.get as jest.Mock).mockImplementation((key: string) => {
          const envVars: Record<string, string> = {
            JWT_SECRET: 'a-very-secure-secret-key-that-is-at-least-32-chars',
            DB_PASSWORD: 'secret',
            NODE_ENV: 'production',
          };
          return envVars[key];
        });

        expect(() => service.validate()).toThrow(
          'Production environment detected with weak or default secrets',
        );
      });
    });

    describe('development mode validation', () => {
      it('should allow shorter secrets in development mode', () => {
        (configService.get as jest.Mock).mockImplementation((key: string) => {
          const envVars: Record<string, string> = {
            JWT_SECRET: 'dev-secret',
            DB_PASSWORD: 'dev-pass',
            NODE_ENV: 'development',
          };
          return envVars[key];
        });

        expect(() => service.validate()).not.toThrow();
      });
    });
  });
});
