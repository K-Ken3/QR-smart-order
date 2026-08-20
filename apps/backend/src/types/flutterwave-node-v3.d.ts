declare module 'flutterwave-node-v3' {
  interface FlutterwaveCharge {
    create(params: Record<string, any>): Promise<{ status: string; data?: { link?: string } }>;
  }
  interface FlutterwaveTransaction {
    verify(params: { id: string }): Promise<{ data: { status: string; amount: number; currency: string } }>;
  }
  export default class Flutterwave {
    Charge: FlutterwaveCharge;
    Transaction: FlutterwaveTransaction;
    constructor(publicKey: string, secretKey: string);
  }
}
