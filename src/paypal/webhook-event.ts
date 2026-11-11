/** Resolve PayPal resource events to their owning checkout order. */
export function extractPayPalOrderId(eventType:string,resource:any):string {
 if(eventType.startsWith("PAYMENT.CAPTURE."))return String(resource?.supplementary_data?.related_ids?.order_id??"");
 return String(resource?.id??resource?.supplementary_data?.related_ids?.order_id??"");
}
