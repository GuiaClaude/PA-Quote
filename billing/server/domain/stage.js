// Operational tracking. Stages are derived (never stored) from the master sheet values + ledger,
// and flags are not mutually exclusive (a job can be Delivered, Billed and Overdue at once).
import { inVocab } from './sheetParse.js';

export const STAGES = ['Job Order Created', 'In Production', 'Completed', 'Delivered', 'Awaiting Billing', 'Billed', 'Invoice Sent', 'Awaiting Payment', 'Partially Paid', 'Paid'];

export function computeTracking(jo, { balance, invoiceSent, sheetCfg, asOf }) {
  const delivered = inVocab(jo.delivery_status, sheetCfg.deliveredValues) || (!!jo.delivery_date && jo.delivery_date <= asOf);
  const completed = delivered || inVocab(jo.production_status, sheetCfg.completedValues);
  const billed = !!jo.invoice_number_source || !!balance?.hasLedger;
  const paid = !!jo.is_paid_in_source;
  const partiallyPaid = !paid && ((balance?.paid > 0 && balance?.outstanding > 0) || inVocab(jo.payment_status_source, sheetCfg.partiallyPaidValues));
  const overdue = !paid && balance?.overdue > 0;
  const billableNow = jo.billable_status === 'billable' || (jo.billable_status === 'per_source' && delivered);
  let stage;
  if (paid) stage = 'Paid';
  else if (partiallyPaid) stage = 'Partially Paid';
  else if (billed && invoiceSent) stage = overdue || (balance?.invoices || []).some((l) => l.dueDate && l.dueDate <= asOf) ? 'Awaiting Payment' : 'Invoice Sent';
  else if (billed) stage = 'Billed';
  else if (delivered && billableNow) stage = 'Awaiting Billing';
  else if (delivered) stage = 'Delivered';
  else if (completed) stage = 'Completed';
  else if (jo.production_status) stage = 'In Production';
  else stage = 'Job Order Created';

  let exception = jo.exception_state ? { on_hold: 'On Hold', disputed: 'Disputed', cancelled: 'Cancelled', for_verification: 'For Verification' }[jo.exception_state] : null;
  if (!exception) {
    if ([jo.production_status, jo.delivery_status, jo.payment_status_source].some((v) => inVocab(v, sheetCfg.cancelledValues))) exception = 'Cancelled';
    else if (inVocab(jo.payment_status_source, sheetCfg.disputedValues)) exception = 'Disputed';
    else if ([jo.production_status, jo.payment_status_source].some((v) => inVocab(v, sheetCfg.onHoldValues))) exception = 'On Hold';
  }
  return { stage, exception, flags: { delivered, completed, billed, invoiceSent: !!invoiceSent, partiallyPaid, paid, overdue, billableNow } };
}
