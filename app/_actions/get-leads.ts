import axios from 'axios';

const rdApi = axios.create({
  baseURL: 'https://api.rd.services/platform',
  headers: {
    Authorization: `Bearer ${process.env.RD_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

export interface RDLead {
  uuid: string;
  name: string;
  email: string;
  mobile_phone?: string;
  custom_fields: Record<string, string>;
}

export async function fetchLeads(page = 1, pageSize = 50): Promise<RDLead[]> {
  const { data } = await rdApi.get('/contacts', {
    params: {
      page,
      page_size: pageSize,
    },
  });

  return data.contacts;
}
