import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Organization, type OrganizationInvitation, type OrganizationMember } from './api';

export function TeamScreen({ organization, onAccepted }: { organization: Organization; onAccepted: () => Promise<void> }) {
  const canManage = ['owner', 'admin'].includes(organization.role);
  const [members, setMembers] = useState<OrganizationMember[]>([]); const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({}); const [email, setEmail] = useState(''); const [inviteRole, setInviteRole] = useState<'admin' | 'accountant' | 'viewer'>('accountant');
  const [transferTarget, setTransferTarget] = useState<OrganizationMember | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const requests: Array<Promise<unknown>> = [api.invitations()];
    if (canManage) requests.push(api.members(organization.id));
    void Promise.all(requests).then(([inviteResult, memberResult]) => {
      if (!active) return;
      setInvitations((inviteResult as { invitations: OrganizationInvitation[] }).invitations);
      const rows = (memberResult as { members: OrganizationMember[] } | undefined)?.members ?? [];
      setMembers(rows); setRoles(Object.fromEntries(rows.map(row => [row.id, row.role]))); setError('');
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Team information could not be loaded.'); });
    return () => { active = false; };
  }, [organization.id, canManage, version]);
  async function invite(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await api.inviteMember(organization.id, email, inviteRole); setEmail('');
      setNotice(result.notificationSent ? 'Invitation created and email notification sent. The verified user can sign in and accept it from Team.' : 'Invitation created, but email was not sent. Share this with the verified user so they can sign in and accept it.');
      setVersion(value => value + 1);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation could not be created.'); }
  }
  async function update(member: OrganizationMember, input: { role: string } | { status: 'active' | 'suspended' }) {
    try { await api.updateMember(organization.id, member.id, input); setNotice('Membership updated and recorded in the audit trail.'); setVersion(value => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Membership could not be updated.'); }
  }
  async function accept(invitation: OrganizationInvitation) {
    try { await api.acceptInvitation(invitation.organizationId, invitation.id); setNotice(`Invitation to ${invitation.organizationName} accepted.`); setVersion(value => value + 1); await onAccepted(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation could not be accepted.'); }
  }
  async function transferOwnership() {
    if (!transferTarget) return;
    try {
      await api.transferOwnership(organization.id, transferTarget.id);
      setNotice(`Ownership transferred to ${transferTarget.email}. Your role is now admin.`);
      setTransferTarget(null); setVersion(value => value + 1); await onAccepted();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ownership could not be transferred.'); }
  }
  return <Stack spacing={2}>
    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}{notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    {!!invitations.length && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1.5}><Typography variant="h6">Invitations for you</Typography>
      {invitations.map(invitation => <Stack key={invitation.id} direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1}>
        <Typography>{invitation.organizationName} · {invitation.role}</Typography><Button variant="contained" onClick={() => void accept(invitation)}>Accept invitation</Button>
      </Stack>)}
    </Stack></Paper>}
    {canManage && <>
      <Paper variant="outlined" sx={{ p: 2 }}><Stack component="form" spacing={2} onSubmit={event => { void invite(event); }}>
        <Typography variant="h6">Invite a registered user</Typography><Typography variant="body2" color="text.secondary">Invitations are available only to users with a verified Aslibooks account. An email notification is sent only when transactional email is configured and delivery succeeds; otherwise share the invitation instructions with the user.</Typography>
        <TextField required type="email" label="Verified account email" value={email} onChange={event => setEmail(event.target.value)} />
        <TextField select label="Role" value={inviteRole} onChange={event => setInviteRole(event.target.value as typeof inviteRole)}>
          {organization.role === 'owner' && <MenuItem value="admin">Admin</MenuItem>}<MenuItem value="accountant">Accountant</MenuItem><MenuItem value="viewer">Viewer</MenuItem>
        </TextField><Button type="submit" variant="contained">Create invitation</Button>
      </Stack></Paper>
      <Stack spacing={1}><Typography variant="h6">Organization members</Typography>
        {members.map(member => {
          const mayManage = !member.isSelf && member.role !== 'owner' && (organization.role === 'owner' || member.role !== 'admin');
          return <Paper variant="outlined" sx={{ p: 2 }} key={member.id}><Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={1.5}>
            <Stack sx={{ flex: 1 }}><Typography fontWeight={650}>{member.name || member.email}{member.isSelf ? ' (you)' : ''}</Typography><Typography variant="body2" color="text.secondary">{member.email} · {member.status}</Typography></Stack>
            <Typography>{member.role}</Typography>
            {mayManage && <>
              <TextField select size="small" label={`Role for ${member.email}`} value={roles[member.id] ?? member.role} onChange={event => setRoles(values => ({ ...values, [member.id]: event.target.value }))} sx={{ minWidth: 150 }}>
                {organization.role === 'owner' && <MenuItem value="admin">Admin</MenuItem>}<MenuItem value="accountant">Accountant</MenuItem><MenuItem value="viewer">Viewer</MenuItem>
              </TextField>
              <Button onClick={() => void update(member, { role: roles[member.id] ?? member.role })} disabled={(roles[member.id] ?? member.role) === member.role}>Save role</Button>
              <Button color={member.status === 'active' ? 'error' : 'primary'} onClick={() => void update(member, { status: member.status === 'active' ? 'suspended' : 'active' })}>
                {member.status === 'active' ? 'Suspend' : member.status === 'invited' ? 'Cancel invite' : 'Reactivate'}
              </Button>
              {organization.role === 'owner' && member.role === 'admin' && member.status === 'active' &&
                <Button color="warning" onClick={() => { setError(''); setTransferTarget(member); }}>Transfer ownership</Button>}
            </>}
          </Stack></Paper>;
        })}
      </Stack>
    </>}
    <Dialog open={!!transferTarget} onClose={() => setTransferTarget(null)} aria-labelledby="transfer-ownership-title">
      <DialogTitle id="transfer-ownership-title">Transfer organization ownership?</DialogTitle>
      <DialogContent><DialogContentText>
        {transferTarget?.email} will become the owner. Your role will change to admin immediately. Only transfer ownership to someone you trust.
      </DialogContentText></DialogContent>
      <DialogActions><Button onClick={() => setTransferTarget(null)}>Cancel</Button>
        <Button color="warning" variant="contained" onClick={() => void transferOwnership()}>Confirm ownership transfer</Button></DialogActions>
    </Dialog>
  </Stack>;
}
