import { Box, Button, Divider, Paper, Typography } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import type { UserProfile } from "../api";
import type { Role } from "../types";

const roleLabels: Record<Role, string> = { CLIENT: "Клиент", SPECIALIST: "Специалист", ADMIN: "Администратор" };

interface ProfilePageProps { profile: UserProfile; onBack: () => void; }
export default function ProfilePage({ profile, onBack }: ProfilePageProps) {
  return <Box className="profile-page"><Button startIcon={<ArrowBack />} onClick={onBack}>Вернуться к заявке</Button>
    <Paper className="profile-card"><Typography className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</Typography><Typography variant="h3">{profile.name}</Typography>
      <Typography color="text.secondary">Данные профиля и компании, которые используются в заявке.</Typography><Divider />
      <Box className="profile-facts"><Box><span>Логин</span><b>{profile.login}</b></Box><Box><span>Роль</span><b>{roleLabels[profile.role]}</b></Box><Box><span>Телефон</span><b>{profile.phone || "Не указан"}</b></Box><Box><span>Компания</span><b>{profile.company?.name || "Не указана"}</b></Box><Box><span>ИНН</span><b>{profile.company?.inn || "Не указан"}</b></Box><Box><span>Форма и ОКВЭД</span><b>{profile.company ? `${profile.company.legalForm}${profile.company.okved ? ` · ${profile.company.okved}` : ""}` : "Не указаны"}</b></Box><Box><span>Регион</span><b>{profile.company?.region || "Не указан"}</b></Box><Box><span>Год регистрации</span><b>{profile.company?.registrationYear || "Не указан"}</b></Box><Box><span>Средний оборот по счёту</span><b>{profile.company?.averageMonthlyTurnover ? `${profile.company.averageMonthlyTurnover.toLocaleString("ru-RU")} ₽ в месяц` : "Не указан"}</b></Box></Box>
    </Paper></Box>;
}
