import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SecurityService } from '../../common/security.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import type { Env } from '../../config/env';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SecurityService, AuthGuard],
  exports: [AuthService, SecurityService, AuthGuard, JwtModule],
})
export class AuthModule {}
