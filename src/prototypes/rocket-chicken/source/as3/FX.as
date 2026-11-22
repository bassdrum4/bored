package
{
   public class FX
   {
      
      public var follow:*;
      
      public var time:int;
      
      public var sheet:int;
      
      public var delay:int;
      
      public var i:int;
      
      public var active:int = 0;
      
      public function FX(param1:*, param2:int, param3:int)
      {
         super();
         this.follow = param1;
         this.time = param2;
         this.sheet = param3;
      }
   }
}

