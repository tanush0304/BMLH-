import { Truck } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
import {
  listJobWorkTypes,
  createJobWorkType,
  updateJobWorkType,
  deleteJobWorkType,
} from '../../data/queries/jobWorkTypes'

const EMPTY_FORM = {
  job_work_code: '',
  type_of_job_work: '',
  lead_time_days: '',
}

const SECTIONS = [
  {
    icon: Truck,
    title: '1. Job Work Type Details',
    subtitle: 'Outsourced operation and lead time',
    width: 'full',
    fields: [
      { key: 'job_work_code', label: 'Job Work Code', required: true, lockOnEdit: true },
      { key: 'type_of_job_work', label: 'Type of Job Work', required: true },
      { key: 'lead_time_days', label: 'Lead Time (Days)', type: 'number' },
    ],
  },
]

const LIST_COLUMNS = [
  { key: 'job_work_code', label: 'Job Work Code' },
  { key: 'type_of_job_work', label: 'Type of Job Work' },
  { key: 'lead_time_days', label: 'Lead Time (Days)' },
]

export default function JobWorkMaster() {
  return (
    <MasterFormScreen
      title="Job Work Master"
      subtitle="Manage Outsourcing Types  |  Heat Treatment, Broaching, Toughening & More"
      pkField="job_work_code"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['job_work_code', 'type_of_job_work']}
      api={{
        list: listJobWorkTypes,
        create: createJobWorkType,
        update: updateJobWorkType,
        remove: deleteJobWorkType,
      }}
      exportFilename="job_work_master.csv"
    />
  )
}
