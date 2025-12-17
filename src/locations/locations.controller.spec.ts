/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { LocationsController } from './locations.controller';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { LocationsModule } from './locations.module';
import request from 'supertest';
import { App } from 'supertest/types';
import TestAgent from 'supertest/lib/agent';

describe('LocationsController', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let agent: TestAgent;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [LocationsModule],
    }).compile();

    app = module.createNestApplication();

    await app.init();
    prisma = module.get(PrismaService);
    agent = request.agent(app.getHttpServer());
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return list of provinces', async () => {
    await agent
      .get('/locations/provinces')
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Array);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('name_th');
        expect(res.body[0]).toHaveProperty('province_id');
      });
  });

  it('should return list of districts by given province_id', async () => {
    await agent
      .get('/locations/province/25/districts')
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Array);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('name_th');
        expect(res.body[0]).toHaveProperty('district_id');
      });
  });

  it('should return list of subdistricts by given district_id', async () => {
    await agent
      .get('/locations/district/2501/subdistricts')
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Array);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('name_th');
        expect(res.body[0]).toHaveProperty('subdistrict_id');
      });
  });
});
