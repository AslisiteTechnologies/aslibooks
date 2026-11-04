import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Checkbox, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Contact, type ContactInput, type Organization } from './api';

export function ContactsScreen({ organization }: { organization: Organization }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState({ displayName: '', email: '', phone: '', customer: false, vendor: false });
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const canWrite = ['owner', 'admin', 'accountant'].includes(organization.role);
  useEffect(() => {
    let active = true;
    api.contacts(organization.id, query).then(result => { if (active) { setContacts(result.contacts); setError(''); } })
      .catch(() => { if (active) setError('Unable to load contacts.'); });
    return () => { active = false; };
  }, [organization.id, query, revision]);
  async function save(event: FormEvent) {
    event.preventDefault();
    const input: ContactInput = {
      displayName: draft.displayName, email: draft.email,
      phone: draft.phone, roles: [...(draft.customer ? ['customer' as const] : []), ...(draft.vendor ? ['vendor' as const] : [])],
    };
    try {
      await api.createContact(organization.id, input);
      setDraft({ displayName: '', email: '', phone: '', customer: false, vendor: false });
      setRevision(n => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create contact.'); }
  }
  return <Stack spacing={2}>
    <Typography variant="h5">Customers and vendors</Typography>
    <TextField label="Search contacts" value={query} onChange={event => setQuery(event.target.value)} />
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack component="form" spacing={2} onSubmit={event => { void save(event); }}>
        <Typography variant="h6">Add contact</Typography>
        <TextField required label="Name" value={draft.displayName}
          onChange={event => setDraft({ ...draft, displayName: event.target.value })} />
        <TextField label="Email" type="email" value={draft.email}
          onChange={event => setDraft({ ...draft, email: event.target.value })} />
        <Stack direction="row">
          <FormControlLabel control={<Checkbox checked={draft.customer} onChange={e => setDraft({ ...draft, customer: e.target.checked })} />} label="Customer" />
          <FormControlLabel control={<Checkbox checked={draft.vendor} onChange={e => setDraft({ ...draft, vendor: e.target.checked })} />} label="Vendor" />
        </Stack>
        <Button type="submit" variant="contained">Save contact</Button>
      </Stack>
    </Paper>}
    {error && <Alert severity="error">{error}</Alert>}
    {!error && !contacts.length && <Typography>No matching contacts.</Typography>}
    {contacts.map(contact => <Paper variant="outlined" sx={{ p: 2 }} key={contact._id}>
      <Typography variant="h6">{contact.displayName}</Typography>
      <Typography>{contact.roles.join(' · ')}{contact.email ? ' · ' + contact.email : ''}</Typography>
      {canWrite && <Button onClick={() => { void api.updateContact(organization.id, contact._id, { active: false })
        .then(() => setRevision(n => n + 1)).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to archive contact.')); }}>
        Archive
      </Button>}
    </Paper>)}
  </Stack>;
}
