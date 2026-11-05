import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Contact, type ContactInput, type Organization } from './api';

export function ContactsScreen({ organization }: { organization: Organization }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState({ displayName: '', email: '', phone: '', customer: false, vendor: false });
  const [details, setDetails] = useState({ gstin: '', address: '' });
  const [editing, setEditing] = useState<Contact | null>(null);
  const [editDraft, setEditDraft] = useState<ContactInput>({ displayName: '', roles: [] });
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
      phone: draft.phone, gstin: details.gstin, address: details.address,
      roles: [...(draft.customer ? ['customer' as const] : []), ...(draft.vendor ? ['vendor' as const] : [])],
    };
    try {
      await api.createContact(organization.id, input);
      setDraft({ displayName: '', email: '', phone: '', customer: false, vendor: false });
      setDetails({ gstin: '', address: '' });
      setRevision(n => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create contact.'); }
  }
  function beginEdit(contact: Contact) {
    setEditing(contact);
    setEditDraft({ displayName: contact.displayName, email: contact.email ?? '', phone: contact.phone ?? '', gstin: contact.gstin ?? '', address: contact.address ?? '', roles: [...contact.roles] });
  }
  async function saveEdit() {
    if (!editing) return;
    try { await api.updateContact(organization.id, editing._id, editDraft); setEditing(null); setRevision(n => n + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update contact.'); }
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
        <TextField label="Phone" value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })} />
        <TextField label="GSTIN (optional)" value={details.gstin} inputProps={{ maxLength: 15 }} onChange={event => setDetails({ ...details, gstin: event.target.value.toUpperCase() })} />
        <TextField label="Billing address" multiline minRows={2} value={details.address} onChange={event => setDetails({ ...details, address: event.target.value })} />
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
      {contact.phone && <Typography variant="body2">Phone: {contact.phone}</Typography>}
      {contact.gstin && <Typography variant="body2">GSTIN: {contact.gstin}</Typography>}
      {contact.address && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>Billing address: {contact.address}</Typography>}
      {canWrite && <Stack direction="row" spacing={1}>
        <Button onClick={() => beginEdit(contact)}>Edit details</Button>
        <Button onClick={() => { void api.updateContact(organization.id, contact._id, { active: false })
          .then(() => setRevision(n => n + 1)).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to archive contact.')); }}>Archive</Button>
      </Stack>}
    </Paper>)}
    <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
      <DialogTitle>Edit contact details</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <TextField required label="Name" value={editDraft.displayName} onChange={event => setEditDraft({ ...editDraft, displayName: event.target.value })} />
        <TextField label="Email" type="email" value={editDraft.email ?? ''} onChange={event => setEditDraft({ ...editDraft, email: event.target.value })} />
        <TextField label="Phone" value={editDraft.phone ?? ''} onChange={event => setEditDraft({ ...editDraft, phone: event.target.value })} />
        <TextField label="GSTIN (optional)" inputProps={{ maxLength: 15 }} value={editDraft.gstin ?? ''} onChange={event => setEditDraft({ ...editDraft, gstin: event.target.value.toUpperCase() })} />
        <TextField label="Billing address" multiline minRows={2} value={editDraft.address ?? ''} onChange={event => setEditDraft({ ...editDraft, address: event.target.value })} />
        <Stack direction="row"><FormControlLabel label="Customer" control={<Checkbox checked={editDraft.roles.includes('customer')} onChange={event => setEditDraft({ ...editDraft, roles: event.target.checked ? [...new Set([...editDraft.roles, 'customer' as const])] : editDraft.roles.filter(role => role !== 'customer') })} />} />
          <FormControlLabel label="Vendor" control={<Checkbox checked={editDraft.roles.includes('vendor')} onChange={event => setEditDraft({ ...editDraft, roles: event.target.checked ? [...new Set([...editDraft.roles, 'vendor' as const])] : editDraft.roles.filter(role => role !== 'vendor') })} />} /></Stack>
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="contained" onClick={() => void saveEdit()} disabled={!editDraft.displayName.trim() || !editDraft.roles.length}>Save changes</Button></DialogActions>
    </Dialog>
  </Stack>;
}
