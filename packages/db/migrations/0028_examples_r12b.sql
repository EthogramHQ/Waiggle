-- R12b : les comptes d'exemples, une ligne par compte marqué par infra/mark-example.sh. Une table
-- neuve, vide : aucune ligne existante ne change, et tous les comptes restent ordinaires tant que le
-- script n'a rien marqué. La clé primaire (user_id) sert aussi de seul index : chaque lecture
-- cherche un compte précis.
CREATE TABLE "example_account" (
	"user_id" text PRIMARY KEY NOT NULL,
	"marked_at" timestamp NOT NULL
);
--> statement-breakpoint
-- La clé étrangère vers "user", en cascade : un compte supprimé emporte son marquage.
ALTER TABLE "example_account" ADD CONSTRAINT "example_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
