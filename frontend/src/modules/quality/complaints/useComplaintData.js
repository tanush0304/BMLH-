import { useCallback, useEffect, useMemo, useState } from 'react'
import { listComplaints } from '../../../data/queries/customerComplaints'
import { listCustomers } from '../../../data/queries/customers'
import { listProducts } from '../../../data/queries/products'
import { listEmployees } from '../../../data/queries/employees'
import { mergeOptions } from '../../../components/SelectWithAddNew'
import { COMPLAINT_SOURCE_OPTIONS, DEFECT_OPTIONS, complaintListRows } from '../../../utils/customerComplaints'

/** Complaints + the masters both complaint screens need. */
export default function useComplaintData() {
  const [complaints, setComplaints] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cmp, cust, prod, emp] = await Promise.all([listComplaints(), listCustomers(), listProducts(), listEmployees()])
      setComplaints(cmp)
      setCustomers(cust)
      setProducts(prod)
      setEmployees(emp)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const rows = useMemo(() => complaintListRows(complaints, customers, products), [complaints, customers, products])
  const sourceOptions = useMemo(() => mergeOptions(COMPLAINT_SOURCE_OPTIONS, complaints.map((c) => c.complaint_source)), [complaints])
  const defectOptions = useMemo(() => mergeOptions(DEFECT_OPTIONS, complaints.map((c) => c.defect_problem)), [complaints])

  return { complaints, customers, products, employees, rows, sourceOptions, defectOptions, loading, error, refresh }
}
