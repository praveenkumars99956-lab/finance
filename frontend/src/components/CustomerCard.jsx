function CustomerCard({
  customer,
  onAddPayment,
  onEdit,
  onDelete
}) {
  return (
    <div className="customer-record">

      <h3>{customer.name}</h3>

      <p>
        Date: <strong>{customer.date}</strong>
      </p>

      <p>
        Total Amount:
        <strong>
          {' '}₹{customer.amount.toLocaleString('en-IN')}
        </strong>
      </p>

      <p>
        Paid:
        <strong>
          {' '}₹{customer.paid.toLocaleString('en-IN')}
        </strong>
      </p>

      <p>
        Pending:
        <strong>
          {' '}₹{customer.pending.toLocaleString('en-IN')}
        </strong>
      </p>

      <div className="record-buttons">

        <button onClick={() => onAddPayment(customer)}>
          Add Payment
        </button>

        <button onClick={() => onEdit(customer)}>
          Edit
        </button>

        <button onClick={() => onDelete(customer.id)}>
          Delete
        </button>

      </div>

    </div>
  )
}

export default CustomerCard