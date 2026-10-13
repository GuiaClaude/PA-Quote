// Internal fields that spreadsheet columns can be mapped onto.
// Header names are NEVER assumed: every mapping is configured on the Column Mapping screen
// after inspecting the real Job Order List.
export const FIELDS = {
  jo_number:          { label: 'Job Order Number', type: 'text', required: true, column: 'jo_number' },
  client_name:        { label: 'Client name', type: 'text', required: true, column: 'client_name_source' },
  project_name:       { label: 'Project name', type: 'text', column: 'project_name' },
  description:        { label: 'Project / product description', type: 'text', column: 'description' },
  production_status:  { label: 'Production / job status', type: 'text', column: 'production_status' },
  jo_amount:          { label: 'Job order / contract amount', type: 'money', column: 'jo_amount_source' },
  delivery_status:    { label: 'Delivery status', type: 'text', column: 'delivery_status' },
  delivery_date:      { label: 'Delivery date', type: 'date', column: 'delivery_date' },
  invoice_number:     { label: 'Invoice number', type: 'text', column: 'invoice_number_source' },
  billing_date:       { label: 'Billing / invoice date', type: 'date', column: 'billing_date_source' },
  billing_amount:     { label: 'Billing amount', type: 'money', column: 'billing_amount_source' },
  payment_terms:      { label: 'Payment terms', type: 'text', column: 'payment_terms_source' },
  due_date:           { label: 'Due date', type: 'date', column: 'due_date_source' },
  amount_paid:        { label: 'Amount paid', type: 'money', column: 'amount_paid_source' },
  payment_status:     { label: 'Payment status (master)', type: 'text', required: true, column: 'payment_status_source' },
  remarks:            { label: 'Remarks', type: 'text', column: 'remarks_source' },
  assigned_staff:     { label: 'Assigned staff', type: 'text', column: 'assigned_staff_source' },
};

// Fields the application may ever write back (still requires explicit enablement in settings).
export const WRITABLE_CANDIDATES = ['invoice_number', 'billing_date', 'billing_amount', 'due_date', 'payment_terms', 'payment_status', 'amount_paid', 'remarks'];
