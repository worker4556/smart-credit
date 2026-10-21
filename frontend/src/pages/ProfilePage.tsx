import { Box, Button, Divider, Paper, Typography } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import type { UserProfile } from "../api";

interface ProfilePageProps { profile: UserProfile; onBack: () => void; }
export default function ProfilePage({ profile, onBack }: ProfilePageProps) {
  return <Box className="profile-page"><Button startIcon={<ArrowBack />} onClick={onBack}>Вернуться к заявке</Button>
    <Paper className="profile-card"><Typography className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</Typography><Typography variant="h3">{profile.name}</Typography>
      <Typography color="text.secondary">Данные профиля и компании, которые используются в заявке.</Typography><Divider />
      <Box className="profile-facts"><Box><span>Логин / email</span><b>{profile.email || "Не указан"}</b></Box><Box><span>Телефон</span><b>{profile.phone || "Не указан"}</b></Box><Box><span>Компания</span><b>{profile.company?.name || "Не указана"}</b></Box><Box><span>ИНН</span><b>{profile.inn || "Не указан"}</b></Box><Box><span>Регион</span><b>{profile.region || profile.company?.region || "Не указан"}</b></Box></Box>
    </Paper></Box>;
}
