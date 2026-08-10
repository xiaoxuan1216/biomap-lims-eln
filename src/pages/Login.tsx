import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

export default function Login() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{t("欢迎")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              window.location.href = "/api/oauth/login";
            }}
          >
            {t("使用 Kimi 账号登录")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
