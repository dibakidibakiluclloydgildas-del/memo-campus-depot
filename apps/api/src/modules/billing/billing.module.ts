import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { QuotaService } from './quota.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [BillingController],
  providers: [QuotaService, PrismaService],
  exports: [QuotaService],
})
export class BillingModule {}
