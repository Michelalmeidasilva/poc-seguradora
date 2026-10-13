/** Values exposed by the session-scoped assistance adapter. All data is demonstrative. */
export type AssistanceContractStatus = 'active' | 'pending' | 'cancelled' | 'ended';
export type AssistanceModality = 'individual' | 'familiar';

export interface AssistanceContract {
  status: AssistanceContractStatus;
  modality: AssistanceModality;
  since: string;
}

export interface AssistanceDependent {
  id: string;
  name: string;
  cpf: string;
  birthDate: string;
  relationship: string;
  phone: string;
  biologicalSex: 'female' | 'male' | 'not_informed';
}

export interface AssistanceBenefit {
  id: string;
  name: string;
  service: 'telemedicine' | 'funeral' | 'pharmacy';
  availability: 'illustrative' | 'unavailable';
}

export interface AssistanceDocument {
  id: string;
  title: string;
  status: 'available' | 'generating';
}

export type AssistanceDocumentScreen = 'CON-07' | 'UTI-09' | 'CAN-08';

export interface AssistanceAddress {
  postal: string;
  address: string;
  city: string;
}

export interface AssistanceBilling {
  status: 'demonstrative' | 'pending';
  reference: string;
  message: string;
}

export interface AssistancePreferences {
  contactChannel: 'whatsapp' | 'email';
  email: string;
  paperless: boolean;
  optionalDocs: boolean;
  optionalBenefits: boolean;
}

export type AssistanceRequestKind =
  | 'modality_change'
  | 'renewal'
  | 'cancellation'
  | 'billing_regularization'
  | 'document'
  | 'address_update'
  | 'funeral_assistance'
  | 'human_handoff';
export type AssistanceRequestStatus = 'received' | 'processing' | 'completed';

export interface AssistanceRequest {
  id: string;
  kind: AssistanceRequestKind;
  status: AssistanceRequestStatus;
  message: string;
}

export interface AssistanceSessionSnapshot {
  demonstrative: true;
  contract: AssistanceContract;
  dependents: AssistanceDependent[];
  benefits: AssistanceBenefit[];
  documents: AssistanceDocument[];
  billing: AssistanceBilling;
  preferences: AssistancePreferences;
  currentAddress: AssistanceAddress;
  pendingAddressUpdate?: AssistanceAddress;
  requests: AssistanceRequest[];
}

/** Every command requires the caller to reach the catalog's final confirmation step first. */
export interface ConfirmedAssistanceCommand {
  confirmed: true;
}

export interface AddDependentCommand extends ConfirmedAssistanceCommand {
  dependent: Omit<AssistanceDependent, 'id'>;
}

export interface UpdateDependentCommand extends ConfirmedAssistanceCommand {
  dependentId: string;
  changes: Partial<Omit<AssistanceDependent, 'id'>>;
}

export interface RemoveDependentCommand extends ConfirmedAssistanceCommand {
  dependentId: string;
}

export interface ChangeModalityCommand extends ConfirmedAssistanceCommand {
  modality: AssistanceModality;
}

export interface AssistanceAddressCommand extends ConfirmedAssistanceCommand {
  postal: string;
  address: string;
  city: string;
}

export interface FuneralAssistanceCommand extends ConfirmedAssistanceCommand {
  city: string;
  state: string;
}

export interface RegularizeBillingCommand extends ConfirmedAssistanceCommand {
  reference: string;
}

export interface UpdatePreferencesCommand extends ConfirmedAssistanceCommand {
  preferences: AssistancePreferences;
}

export interface CreateAssistanceRequestCommand extends ConfirmedAssistanceCommand {
  kind: AssistanceRequestKind;
  message: string;
}
