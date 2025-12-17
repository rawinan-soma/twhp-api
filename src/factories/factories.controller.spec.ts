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
import * as bcrypt from 'bcrypt';
import { ConfigModule, ConfigService } from '@nestjs/config';

describe('Factories', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let agent: TestAgent;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [FactoriesModule, AuthenticationModule, ConfigModule],
      providers: [ConfigService],
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
            is_validate: true,
          },
        },
      },
    });

    await prisma.accounts.create({
      data: {
        username: 'doh6',
        password: await bcrypt.hash('12345', 12),
        email: 'doh6@mail.com',
        role: 'Evaluator',
        evaluator: {
          create: {
            first_name: 'ศูนย์อนามัย6',
            last_name: 'ศูนย์อนามัย6',
            phone_number: '0900000000',
            level: 'DOH',
            region: 6,
          },
        },
      },
    });

    await prisma.accounts.create({
      data: {
        username: 'odpc6',
        password: await bcrypt.hash('12345', 12),
        email: 'odpc6@mail.com',
        role: 'Evaluator',
        evaluator: {
          create: {
            first_name: 'สคร6',
            last_name: 'สคร6',
            phone_number: '0900000000',
            level: 'ODPC',
            region: 6,
          },
        },
      },
    });

    await prisma.accounts.create({
      data: {
        username: 'mental6',
        password: await bcrypt.hash('12345', 12),
        email: 'mental6@mail.com',
        role: 'Evaluator',
        evaluator: {
          create: {
            first_name: 'ศูนย์จิต6',
            last_name: 'ศูนย์จิต6',
            phone_number: '0900000000',
            level: 'Mental',
            region: 6,
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

  it('should not login if it is not validate by admins', async () => {
    const factoryId = await prisma.factories.findFirst({
      where: { account: { username: 'factory1' } },
    });

    await prisma.factories.update({
      where: { account_id: factoryId?.account_id },
      data: { is_validate: false },
    });

    await agent
      .post('/authentication/login')
      .send({ username: 'factory1', password: '12345' })
      .expect(401)
      .expect((res) => {
        expect(res.body).toHaveProperty('message', 'factory not validated');
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

  it('should enroll to the evaluation project', async () => {
    await agent
      .post('/factories/enroll')
      .send({
        employee_th_m: 25,
        employee_mm_m: 10,
        employee_kh_m: 5,
        employee_la_m: 3,
        employee_vn_m: 8,
        employee_cn_m: 2,
        employee_ph_m: 4,
        employee_jp_m: 1,
        employee_in_m: 6,
        employee_other_m: 2,
        employee_th_f: 30,
        employee_mm_f: 12,
        employee_kh_f: 7,
        employee_la_f: 4,
        employee_vn_f: 9,
        employee_cn_f: 3,
        employee_ph_f: 5,
        employee_jp_f: 2,
        employee_in_f: 8,
        employee_other_f: 3,
        standard_HC: true,
        standard_SAN: true,
        standard_wellness: false,
        standard_safety: true,
        standard_TIS18001: false,
        standard_ISO45001: true,
        standard_ISO14001: true,
        standard_zero: false,
        standard_5S: true,
        standard_HAS: false,
        safety_officer_prefix: 'นาย',
        safety_officer_first_name: 'สมชาย',
        safety_officer_last_name: 'ใจดี',
        safety_officer_position: 'เจ้าหน้าที่ความปลอดภัย',
        safety_officer_email: 'somchai.jaidee@company.com',
        safety_officer_phone: '0812345678',
        safety_officer_lineID: 'somchai_safety',
      })
      .expect(201);

    const result = await prisma.enrolls.findFirst({
      where: { factory: { account: { username: 'factory1' } } },
    });

    expect(result).not.toBeNull();

    expect(result).toMatchObject({
      safety_officer_prefix: 'นาย',
      safety_officer_first_name: 'สมชาย',
      safety_officer_last_name: 'ใจดี',
      safety_officer_position: 'เจ้าหน้าที่ความปลอดภัย',
      safety_officer_email: 'somchai.jaidee@company.com',
      safety_officer_phone: '0812345678',
      safety_officer_lineID: 'somchai_safety',
    });

    expect(result!.eval_doh_id).not.toBeNull();
    expect(result!.eval_odpc_id).not.toBeNull();
    expect(result!.eval_mental_id).not.toBeNull();
  });
});
