/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { FactoriesModule } from './factories.module';
import { AuthenticationModule } from 'src/authentication/authentication.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import TestAgent from 'supertest/lib/agent';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';

describe('Factories', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let agent: TestAgent;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [FactoriesModule, AuthenticationModule],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    prisma = app.get(PrismaService);
    agent = request.agent(app.getHttpServer());

    await prisma.accounts.deleteMany();
    await prisma.factories.deleteMany();
    await prisma.accounts.create({
      data: {
        username: 'doed01',
        password:
          '$2a$12$RC/Pirt5C81LY/xHacGTDO4d7v2RPx18CEypubSjRDPbeP7GeUXBa',
        email: 'doed01@mail.com',
        role: 'DOED',
        adminDoed: {
          create: {
            first_name: 'Doed',
            last_name: 'Doed',
            phone_number: '12345678',
          },
        },
      },
    });
    await prisma.accounts.create({
      data: {
        username: 'factory1',
        password:
          '$2a$12$RC/Pirt5C81LY/xHacGTDO4d7v2RPx18CEypubSjRDPbeP7GeUXBa',
        email: 'factory1@mail.com',
        role: 'Factory',
        factory: {
          create: {
            factory_type: 1,
            name_th: 'โรงงานลำไย',
            name_en: 'Factory Lamai',
            tsic_code: '889900',
            address_no: '123/456',
            road: 'ถนนลำไย',
            soi: 'ซอยลำไย 8',
            zipcode: '25000',
            phone_number: '099999999',
            fax_number: '099999998',
            province_id: 25,
            district_id: 2501,
            subdistrict_id: 250101,
          },
        },
      },
    });
    await agent
      .post('/authentication/login')
      .send({ username: 'factory1', password: '12345' })
      .expect(200);
  });
  afterEach(async () => {
    await prisma.accounts.deleteMany();
    await prisma.factories.deleteMany();
  });

  it('should login with correct password', async () => {
    return await agent
      .get('/authentication')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('username', 'factory1');
      });
  });

  it('should register new factories', async () => {
    await agent.post('/authentication/logout');

    await agent
      .post('/factories/register')
      .send({
        username: 'factory2',
        password: '12345',
        email: 'factory2@mail.com',
        factory_type: 1,
        name_th: 'โรงงานรองเท้า',
        name_en: 'Factory Shoes',
        tsic_code: '777777',
        address_no: '123/456',
        road: 'ถนนรองเท้า',
        soi: 'ซอยรองเท้า 5',
        zipcode: '11000',
        phone_number: '099999999',
        fax_number: '099999998',
        subdistrict_id: 300101,
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('factory');
        expect(res.body.factory).toHaveProperty('factory_id', 'factory2');
        expect(res.body.factory).toHaveProperty('name', 'โรงงานรองเท้า');
      });

    expect(
      await prisma.accounts.findUnique({ where: { username: 'factory2' } }),
    ).not.toBeNull();
    expect(
      await prisma.accounts.findUnique({
        where: { username: 'factory2' },
        include: { factory: true },
      }),
    ).toMatchObject({
      username: 'factory2',
      factory: { name_th: 'โรงงานรองเท้า' },
    });
  });

  it('should not register existing factory', async () => {
    await agent
      .post('/factories/register')
      .send({
        username: 'factory1',
        password: '12345',
        email: 'factory_1@mail.com',
        factory_type: 1,
        name_th: 'โรงงานลำไย',
        name_en: 'Factory Lamai',
        soi: 'ซอยลำไย 8',
        tsic_code: '889900',
        address_no: '123/456',
        road: 'ถนนลำไย',
        zipcode: '25000',
        phone_number: '099999999',
        fax_number: '09999998',
        subdistrict_id: 250101,
      })
      .expect(400)
      .expect((res) => {
        expect(res.body).toHaveProperty('message', 'factory already exists');
      });
  });

  it('should edit own factory data', async () => {
    await agent
      .patch('/factories')
      .send({
        name_th: 'โรงงานถุงมือ',
        name_en: 'Glove factory',
        email: 'factory_2new@mail.com',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty(
          'message',
          'factory updated successfully',
        );
      });

    expect(
      await prisma.accounts.findUnique({ where: { username: 'factory1' } }),
    ).not.toBeNull();
    expect(
      await prisma.accounts.findUnique({
        where: { username: 'factory1' },
        include: { factory: true },
      }),
    ).toMatchObject({
      username: 'factory1',
      email: 'factory_2new@mail.com',
      factory: { name_th: 'โรงงานถุงมือ', name_en: 'Glove factory' },
    });
  });

  it('should edit password and use new password to login', async () => {
    await agent
      .patch('/factories')
      .send({
        password: 'newpassword',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty(
          'message',
          'factory updated successfully',
        );
      });

    await agent
      .post('/authentication/login')
      .send({
        username: 'factory1',
        password: 'newpassword',
      })
      .expect(200);

    await agent
      .get('/authentication')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('username', 'factory1');
      });
  });

  it('should not access endpoint if not Factory', async () => {
    await agent.post('/authentication/logout').expect(200);

    await agent
      .post('/authentication/login')
      .send({
        username: 'doed01',
        password: '12345',
      })
      .expect(200);

    await agent
      .patch('/factories')
      .send({
        password: 'newpassword',
      })
      .expect(403);
  });
});
