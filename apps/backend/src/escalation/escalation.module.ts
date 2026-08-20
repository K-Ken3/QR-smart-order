import { Module } from '@nestjs/common';
import { EscalationService } from './escalation.service';

@Module({
  providers: [EscalationService],
  exports: [EscalationService],
})
export class EscalationModule {}
