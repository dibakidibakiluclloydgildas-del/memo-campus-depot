import { Module } from '@nestjs/common';
import { AdminController, ReportsController } from './admin.controller';

@Module({ controllers: [AdminController, ReportsController] })
export class AdminModule {}
