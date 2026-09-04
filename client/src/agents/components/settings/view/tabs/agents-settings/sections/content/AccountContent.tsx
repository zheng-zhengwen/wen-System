import { LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, Button } from '../../../../../../../shared/view/ui';
import SessionProviderLogo from '../../../../../../llm-logo-provider/SessionProviderLogo';
import type { AgentProvider, AuthStatus } from '../../../../../types/types';

type AccountContentProps = {
  agent: AgentProvider;
  authStatus: AuthStatus;
  onLogin: () => void;
};

type AgentVisualConfig = {
  name: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  subtextClass: string;
  buttonClass: string;
  description?: string;
};

const agentConfig: Record<AgentProvider, AgentVisualConfig> = {
  claude: {
    name: 'Claude',
    bgClass: 'bg-blue-50 bg-blue-900/20',
    borderClass: 'border-blue-200 border-blue-800',
    textClass: 'text-blue-900 text-blue-100',
    subtextClass: 'text-blue-700 text-blue-300',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
  },
  cursor: {
    name: 'Cursor',
    bgClass: 'bg-purple-50 bg-purple-900/20',
    borderClass: 'border-purple-200 border-purple-800',
    textClass: 'text-purple-900 text-purple-100',
    subtextClass: 'text-purple-700 text-purple-300',
    buttonClass: 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800',
  },
  codex: {
    name: 'Codex',
    bgClass: 'bg-muted/50',
    borderClass: 'border-gray-300 border-gray-600',
    textClass: 'text-gray-900 text-gray-100',
    subtextClass: 'text-gray-700 text-gray-300',
    buttonClass: 'bg-gray-800 hover:bg-gray-900 active:bg-gray-950 bg-gray-700 hover:bg-gray-600 active:bg-gray-500',
  },
  gemini: {
    name: 'Gemini',
    description: 'Google Gemini AI assistant',
    bgClass: 'bg-indigo-50 bg-indigo-900/20',
    borderClass: 'border-indigo-200 border-indigo-800',
    textClass: 'text-indigo-900 text-indigo-100',
    subtextClass: 'text-indigo-700 text-indigo-300',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800',
  },
  opencode: {
    name: 'OpenCode',
    bgClass: 'bg-zinc-50 bg-zinc-900/50',
    borderClass: 'border-zinc-200 border-zinc-800',
    textClass: 'text-zinc-700 text-zinc-300',
    subtextClass: 'text-zinc-500 text-zinc-400',
    buttonClass: 'bg-zinc-600 hover:bg-zinc-700 text-white bg-zinc-700 hover:bg-zinc-600',
  },
  hermes: {
    name: 'Hermes',
    bgClass: 'bg-teal-50 bg-teal-900/50',
    borderClass: 'border-teal-200 border-teal-800',
    textClass: 'text-teal-700 text-teal-300',
    subtextClass: 'text-teal-500 text-teal-400',
    buttonClass: 'bg-teal-600 hover:bg-teal-700 text-white bg-teal-700 hover:bg-teal-600',
  },
  agy: {
    name: 'Antigravity',
    bgClass: 'bg-zinc-50 bg-zinc-900/50',
    borderClass: 'border-zinc-200 border-zinc-800',
    textClass: 'text-zinc-700 text-zinc-300',
    subtextClass: 'text-zinc-500 text-zinc-400',
    buttonClass: 'bg-zinc-600 hover:bg-zinc-700 text-white bg-zinc-700 hover:bg-zinc-600',
  },
  awen: {
    name: 'awenAgent',
    description: '自托管亚马逊运营智能体（awen CLI）',
    bgClass: 'bg-emerald-50 bg-emerald-900/20',
    borderClass: 'border-emerald-200 border-emerald-800',
    textClass: 'text-emerald-900 text-emerald-100',
    subtextClass: 'text-emerald-700 text-emerald-300',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800',
  },
};

export default function AccountContent({ agent, authStatus, onLogin }: AccountContentProps) {
  const { t } = useTranslation('settings');
  const config = agentConfig[agent];

  return (
    <div className="space-y-6">
      <div className="mb-4 flex items-center gap-3">
        <SessionProviderLogo provider={agent} className="h-6 w-6" />
        <div>
          <h3 className="text-lg font-medium text-foreground">{config.name}</h3>
          <p className="text-sm text-muted-foreground">
            {t(`agents.account.${agent}.description`, {
              defaultValue: config.description || `${config.name} CLI assistant`,
            })}
          </p>
        </div>
      </div>

      <div className={`${config.bgClass} border ${config.borderClass} rounded-lg p-4`}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className={`font-medium ${config.textClass}`}>
                {t('agents.connectionStatus')}
              </div>
              <div className={`text-sm ${config.subtextClass}`}>
                {authStatus.loading ? (
                  t('agents.authStatus.checkingAuth')
                ) : authStatus.authenticated ? (
                  t('agents.authStatus.loggedInAs', {
                    email: authStatus.email || t('agents.authStatus.authenticatedUser'),
                  })
                ) : (
                  t('agents.authStatus.notConnected')
                )}
              </div>
            </div>
            <div>
              {authStatus.loading ? (
                <Badge variant="secondary" className="bg-muted">
                  {t('agents.authStatus.checking')}
                </Badge>
              ) : authStatus.authenticated ? (
                <Badge variant="secondary" className="bg-green-100 text-green-800 bg-green-900/30 text-green-300">
                  {t('agents.authStatus.connected')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-gray-100 text-gray-800 bg-gray-800 text-gray-300">
                  {t('agents.authStatus.disconnected')}
                </Badge>
              )}
            </div>
          </div>

          {authStatus.method !== 'api_key' && (
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-medium ${config.textClass}`}>
                    {authStatus.authenticated ? t('agents.login.reAuthenticate') : t('agents.login.title')}
                  </div>
                  <div className={`text-sm ${config.subtextClass}`}>
                    {authStatus.authenticated
                      ? t('agents.login.reAuthDescription')
                      : t('agents.login.description', { agent: config.name })}
                  </div>
                </div>
                <Button
                  onClick={onLogin}
                  className={`${config.buttonClass} text-white`}
                  size="sm"
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  {authStatus.authenticated ? t('agents.login.reLoginButton') : t('agents.login.button')}
                </Button>
              </div>
            </div>
          )}

          {authStatus.error && (
            <div className="border-t border-border/50 pt-4">
              <div className="text-sm text-red-600 text-red-400">
                {t('agents.error', { error: authStatus.error })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
