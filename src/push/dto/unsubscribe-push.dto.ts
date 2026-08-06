import { IsUrl } from 'class-validator';

export class UnsubscribePushDto {
  @IsUrl({ require_tld: false })
  endpoint: string;
}
