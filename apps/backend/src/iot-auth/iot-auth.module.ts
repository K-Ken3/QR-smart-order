import { Module } from '@nestjs/common';
import { IoTAuthController } from './iot-auth.controller';
import { IoTAuthService } from './iot-auth.service';

@Module({
  controllers: [IoTAuthController],
  providers: [IoTAuthService],
  exports: [IoTAuthService],
})
export class IoTAuthModule {}
