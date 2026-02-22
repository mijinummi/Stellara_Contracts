import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './services/analytics.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsMetric, MetricType, MetricCategory } from './entities/analytics-metric.entity';
import { Repository } from 'typeorm';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let repository: Repository<AnalyticsMetric>;

  const mockMetricRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(AnalyticsMetric),
          useValue: mockMetricRepository,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    repository = module.get<Repository<AnalyticsMetric>>(getRepositoryToken(AnalyticsMetric));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordMetric', () => {
    it('should create and save a new metric', async () => {
      const metricData = {
        name: 'test_metric',
        value: 42,
        type: MetricType.GAUGE,
        category: MetricCategory.SYSTEM,
      };

      const mockMetric = { id: '1', ...metricData, timestamp: new Date() };
      mockMetricRepository.create.mockReturnValue(mockMetric);
      mockMetricRepository.save.mockResolvedValue(mockMetric);

      const result = await service.recordMetric(
        metricData.name,
        metricData.value,
        metricData.type,
        metricData.category,
      );

      expect(result).toEqual(mockMetric);
      expect(mockMetricRepository.create).toHaveBeenCalledWith({
        name: metricData.name,
        value: metricData.value,
        type: metricData.type,
        category: metricData.category,
        labels: {},
        tenantId: null,
        userId: null,
      });
      expect(mockMetricRepository.save).toHaveBeenCalledWith(mockMetric);
    });
  });

  describe('getLatestMetrics', () => {
    it('should return latest metrics for a given name', async () => {
      const mockMetrics = [
        { id: '1', name: 'test_metric', value: 10, timestamp: new Date() },
        { id: '2', name: 'test_metric', value: 20, timestamp: new Date() },
      ];

      mockMetricRepository.createQueryBuilder().getMany.mockResolvedValue(mockMetrics);

      const result = await service.getLatestMetrics('test_metric', 10);

      expect(result).toEqual(mockMetrics);
      expect(mockMetricRepository.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('getSystemHealthMetrics', () => {
    it('should return system health metrics', async () => {
      const mockMetrics = [
        { id: '1', name: 'cpu_usage', value: 75, category: MetricCategory.SYSTEM },
        { id: '2', name: 'memory_usage', value: 60, category: MetricCategory.SYSTEM },
      ];

      mockMetricRepository.createQueryBuilder().getMany.mockResolvedValue(mockMetrics);

      const result = await service.getSystemHealthMetrics();

      expect(result).toHaveProperty('totalMetrics');
      expect(result).toHaveProperty('metricsByCategory');
      expect(result).toHaveProperty('recentErrors');
      expect(result).toHaveProperty('uptime');
    });
  });
});